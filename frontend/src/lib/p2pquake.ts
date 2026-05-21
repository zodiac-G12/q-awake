export interface QuakeEvent {
  id: string;
  code: number;
  earthquake: {
    time: string;
    hypocenter: {
      name: string;
      latitude: number;
      longitude: number;
      depth: number;
      magnitude: number;
    };
    maxScale: number;
  };
  points?: Array<{
    pref: string;
    addr: string;
    isArea: boolean;
    scale: number;
  }>;
}

const WS_URL = "wss://api.p2pquake.net/v2/ws";
const HISTORY_BASE = "https://api.p2pquake.net/v2/history?codes=551&limit=";

export function connectQuakeStream(onEvent: (ev: QuakeEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryDelay = 1000;

  const open = () => {
    if (closed) return;
    ws = new WebSocket(WS_URL);
    ws.addEventListener("open", () => {
      retryDelay = 1000;
    });
    ws.addEventListener("message", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.code === 551) onEvent(data as QuakeEvent);
      } catch {
        // ignore malformed frames
      }
    });
    ws.addEventListener("close", () => {
      if (closed) return;
      setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    });
    ws.addEventListener("error", () => ws?.close());
  };

  open();
  return () => {
    closed = true;
    ws?.close();
  };
}

export async function fetchRecentQuakes(limit = 10): Promise<QuakeEvent[]> {
  try {
    const res = await fetch(`${HISTORY_BASE}${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as QuakeEvent[];
  } catch {
    return [];
  }
}
