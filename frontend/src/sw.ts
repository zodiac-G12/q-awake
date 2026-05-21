/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

interface QuakePayload {
  type: "quake";
  id: string;
  place: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  maxScale: number;
  time: string;
}

const SCALE_LABEL: Record<number, string> = {
  10: "1",
  20: "2",
  30: "3",
  40: "4",
  45: "5弱",
  50: "5強",
  55: "6弱",
  60: "6強",
  70: "7",
};

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event: PushEvent): Promise<void> {
  let data: QuakePayload | null = null;
  try {
    data = event.data ? (event.data.json() as QuakePayload) : null;
  } catch {
    data = null;
  }

  const title = data
    ? `震度${SCALE_LABEL[data.maxScale] ?? "?"} ${data.place}`
    : "地震速報";
  const body = data
    ? `M${data.magnitude?.toFixed(1) ?? "?"} / 深さ${data.depth ?? "?"}km / ${data.time ?? ""}`
    : "新しい地震情報があります";

  await self.registration.showNotification(title, {
    body,
    tag: "q-awake-latest",
    data: data ? { eid: data.id } : undefined,
    badge: "/icon-192.png",
    icon: "/icon-192.png",
    requireInteraction: (data?.maxScale ?? 0) >= 50,
    // `renotify` is valid for SW notifications but missing from lib.dom NotificationOptions
    ...({ renotify: true } as object),
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const eid = (event.notification.data as { eid?: string } | undefined)?.eid;
  const target = eid ? `/?eid=${encodeURIComponent(eid)}` : "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.pathname === "/" && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
