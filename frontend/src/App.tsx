import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import EarthquakeMap from "./components/EarthquakeMap";
import {
  connectQuakeStream,
  fetchRecentQuakes,
  QuakeEvent,
} from "./lib/p2pquake";
import { subscribeToPush, getPushStatus } from "./lib/push";

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
  const [quakes, setQuakes] = createSignal<QuakeEvent[]>([]);
  const [pushStatus, setPushStatus] =
    createSignal<"unsupported" | "subscribed" | "default" | "loading">("loading");
  const [toast, setToast] = createSignal<string>("");
  const [listOpen, setListOpen] = createSignal(true);

  const current = createMemo<QuakeEvent | null>(() => quakes()[0] ?? null);

  const clearNotificationsAndBadge = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const notifs = await reg.getNotifications();
      notifs.forEach((n) => n.close());
    } catch {
      // ignore
    }
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
  };

  onMount(async () => {
    void clearNotificationsAndBadge();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void clearNotificationsAndBadge();
      }
    });

    const recent = await fetchRecentQuakes(10);
    const params = new URLSearchParams(location.search);
    const eid = params.get("eid");
    let list = recent;
    if (eid) {
      const idx = list.findIndex((q) => q.id === eid);
      if (idx > 0) {
        const picked = list[idx];
        list = [picked, ...list.filter((_, i) => i !== idx)];
      }
    }
    setQuakes(list);

    const off = connectQuakeStream((ev) => {
      setQuakes((prev) => [ev, ...prev.filter((q) => q.id !== ev.id)].slice(0, 10));
      setToast(`受信: ${ev.earthquake.hypocenter.name}`);
      setTimeout(() => setToast(""), 4000);
    });

    setPushStatus(await getPushStatus());
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

  return (
    <>
      <header>
        <h1>Q-AWAKE 地震速報</h1>
        <Show
          when={pushStatus() !== "unsupported"}
          fallback={<span class="hint">非対応ブラウザ</span>}
        >
          <Show when={pushStatus() !== "subscribed"}>
            <button
              class="subscribe-btn"
              disabled={pushStatus() === "loading"}
              onClick={onSubscribe}
            >
              {pushStatus() === "loading" ? "..." : "通知を有効化"}
            </button>
          </Show>
        </Show>
      </header>
      <main>
        <EarthquakeMap event={current} />
        <Show when={toast()}>
          <div class="toast">{toast()}</div>
        </Show>
        <div class={`event-sheet ${listOpen() ? "open" : "closed"}`}>
          <button
            class="sheet-handle"
            onClick={() => setListOpen(!listOpen())}
            aria-label={listOpen() ? "リストを閉じる" : "リストを開く"}
            aria-expanded={listOpen()}
          >
            <span class="handle-bar" />
            <span class="handle-caption">
              {listOpen() ? "閉じる" : `直近 ${quakes().length} 件`}
            </span>
          </button>
          <div class="event-list" role="list">
            <Show
              when={quakes().length > 0}
              fallback={<div class="empty">最新情報を取得中…</div>}
            >
              <For each={quakes()}>
                {(q, idx) => (
                  <div
                    class={`event-row ${idx() === 0 ? "is-latest" : ""}`}
                    role="listitem"
                  >
                    <span class="scale-badge">
                      {SCALE_LABEL[q.earthquake.maxScale] ?? "?"}
                    </span>
                    <div class="event-info">
                      <div class="place">{q.earthquake.hypocenter.name}</div>
                      <div class="sub">
                        M{q.earthquake.hypocenter.magnitude.toFixed(1)} ・ 深さ
                        {q.earthquake.hypocenter.depth}km ・ {q.earthquake.time}
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </main>
    </>
  );
}
