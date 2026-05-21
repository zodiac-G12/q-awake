const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8787";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const padded = (b64 + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("このブラウザはWeb Pushに対応していません");
  }

  const reg = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されませんでした");
  }

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await postSubscription(existing);
    return existing;
  }

  const keyRes = await fetch(`${BACKEND_URL}/api/vapid-public-key`);
  if (!keyRes.ok) throw new Error("VAPID公開鍵の取得に失敗");
  const publicKey = (await keyRes.text()).trim();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  await postSubscription(sub);
  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${BACKEND_URL}/api/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error("購読登録に失敗");
}

export async function getPushStatus(): Promise<"unsupported" | "subscribed" | "default"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "default";
}
