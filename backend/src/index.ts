import { fetchRecentQuakes, QuakeEvent } from "./p2pquake";
import { sendPush, PushSubscriptionJSON } from "./push";

export interface Env {
  KV: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  MIN_SCALE: string;
  ALLOWED_ORIGINS: string;
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const o = allowed.includes(origin) ? origin : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, init: ResponseInit & { cors: Record<string, string> }) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...init.cors, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req, env);

    if (req.method === "OPTIONS") return new Response(null, { headers });

    if (url.pathname === "/api/vapid-public-key") {
      return new Response(env.VAPID_PUBLIC_KEY, {
        headers: { ...headers, "Content-Type": "text/plain" },
      });
    }

    if (url.pathname === "/api/subscribe" && req.method === "POST") {
      const sub = (await req.json()) as PushSubscriptionJSON;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json({ error: "bad subscription" }, { status: 400, cors: headers });
      }
      const id = await hashEndpoint(sub.endpoint);
      await env.KV.put(`sub:${id}`, JSON.stringify(sub));
      return json({ ok: true }, { cors: headers });
    }

    if (url.pathname === "/api/unsubscribe" && req.method === "POST") {
      const { endpoint } = (await req.json()) as { endpoint: string };
      const id = await hashEndpoint(endpoint);
      await env.KV.delete(`sub:${id}`);
      return json({ ok: true }, { cors: headers });
    }

    if (url.pathname === "/api/recent") {
      const cached = await env.KV.get("last_event", "json");
      return json(cached, { cors: headers });
    }

    // For local dev: manually trigger a scan
    if (url.pathname === "/api/_debug/scan" && req.method === "POST") {
      await checkAndNotify(env);
      return json({ ok: true }, { cors: headers });
    }

    return new Response("not found", { status: 404, headers });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkAndNotify(env));
  },
};

async function checkAndNotify(env: Env): Promise<void> {
  const lastId = (await env.KV.get("last_quake_id")) ?? "";
  let events: QuakeEvent[];
  try {
    events = await fetchRecentQuakes();
  } catch (e) {
    console.error("fetch failed", e);
    return;
  }

  const minScale = Number(env.MIN_SCALE ?? "30");
  const fresh = events
    .filter((e) => e.id > lastId)
    .filter((e) => (e.earthquake?.maxScale ?? -1) >= minScale)
    .sort((a, b) => a.id.localeCompare(b.id));

  const newest = events.reduce((m, e) => (e.id > m ? e.id : m), lastId);
  if (newest !== lastId) await env.KV.put("last_quake_id", newest);

  for (const ev of fresh) {
    await env.KV.put("last_event", JSON.stringify(ev));
    await fanoutPush(env, ev);
  }
}

async function fanoutPush(env: Env, ev: QuakeEvent): Promise<void> {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: "quake",
      id: ev.id,
      place: ev.earthquake?.hypocenter?.name ?? "不明",
      latitude: ev.earthquake?.hypocenter?.latitude,
      longitude: ev.earthquake?.hypocenter?.longitude,
      depth: ev.earthquake?.hypocenter?.depth,
      magnitude: ev.earthquake?.hypocenter?.magnitude,
      maxScale: ev.earthquake?.maxScale,
      time: ev.earthquake?.time,
    }),
  );

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };

  let cursor: string | undefined;
  do {
    const list = await env.KV.list({ prefix: "sub:", cursor });
    for (const key of list.keys) {
      const subStr = await env.KV.get(key.name);
      if (!subStr) continue;
      const sub = JSON.parse(subStr) as PushSubscriptionJSON;
      try {
        const res = await sendPush(sub, payload, vapid);
        if (res.status === 404 || res.status === 410) {
          await env.KV.delete(key.name);
        } else if (!res.ok) {
          console.warn("push non-2xx", key.name, res.status, await res.text());
        }
      } catch (e) {
        console.error("push failed", key.name, e);
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const buf = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
