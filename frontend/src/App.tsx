import { createSignal, onMount, Show } from "solid-js";
import EarthquakeMap from "./components/EarthquakeMap";
import {
  connectQuakeStream,
  fetchLatestQuake,
  QuakeEvent,
} from "./lib/p2pquake";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getPushStatus,
} from "./lib/push";

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

export default function App() {
  const [event, setEvent] = createSignal<QuakeEvent | null>(null);
  const [pushStatus, setPushStatus] =
    createSignal<"unsupported" | "subscribed" | "default" | "loading">("loading");
  const [toast, setToast] = createSignal<string>("");

  onMount(async () => {
    const latest = await fetchLatestQuake();
    if (latest) setEvent(latest);
    const off = connectQuakeStream((ev) => {
      setEvent(ev);
      setToast(`受信: ${ev.earthquake.hypocenter.name}`);
      setTimeout(() => setToast(""), 4000);
    });
    setPushStatus(await getPushStatus());

    // Deep-link: if SW notification click passed an event id, fetch & focus it
    const params = new URLSearchParams(location.search);
    const eid = params.get("eid");
    if (eid) {
      // Try the most recent — if it matches, we use it; otherwise no-op.
      const latestAgain = await fetchLatestQuake();
      if (latestAgain && latestAgain.id === eid) setEvent(latestAgain);
    }

    window.addEventListener("beforeunload", off);
  });

  const onSubscribe = async () => {
    try {
      setPushStatus("loading");
      await subscribeToPush();
      setPushStatus("subscribed");
      setToast("Push通知を有効にしました");
    } catch (e) {
      setPushStatus(await getPushStatus());
      setToast(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setTimeout(() => setToast(""), 4000);
    }
  };

  const onUnsubscribe = async () => {
    setPushStatus("loading");
    await unsubscribeFromPush();
    setPushStatus("default");
    setToast("Push通知を停止しました");
    setTimeout(() => setToast(""), 4000);
  };

  return (
    <>
      <header>
        <h1>Q-AWAKE 地震速報</h1>
        <Show
          when={pushStatus() !== "unsupported"}
          fallback={<span style={{ "font-size": "12px", color: "#8a93a8" }}>非対応ブラウザ</span>}
        >
          <Show
            when={pushStatus() === "subscribed"}
            fallback={
              <button
                class="subscribe-btn"
                disabled={pushStatus() === "loading"}
                onClick={onSubscribe}
              >
                {pushStatus() === "loading" ? "..." : "通知を有効化"}
              </button>
            }
          >
            <button class="subscribe-btn" onClick={onUnsubscribe}>
              通知を停止
            </button>
          </Show>
        </Show>
      </header>
      <main>
        <EarthquakeMap event={event} />
        <Show when={toast()}>
          <div class="toast">{toast()}</div>
        </Show>
        <Show when={event()}>
          <div class="event-card">
            <div class="place">
              <span class="scale-badge">
                震度 {SCALE_LABEL[event()!.earthquake.maxScale] ?? "?"}
              </span>{" "}
              {event()!.earthquake.hypocenter.name}
            </div>
            <div class="meta">
              <span>M {event()!.earthquake.hypocenter.magnitude.toFixed(1)}</span>
              <span>深さ {event()!.earthquake.hypocenter.depth} km</span>
              <span>{event()!.earthquake.time}</span>
            </div>
          </div>
        </Show>
      </main>
    </>
  );
}
