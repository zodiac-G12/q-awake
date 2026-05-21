export interface Hypocenter {
  name: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
}

export interface QuakePoint {
  pref: string;
  addr: string;
  isArea: boolean;
  scale: number;
}

export interface QuakeEvent {
  id: string;
  code: number;
  time: string;
  earthquake: {
    time: string;
    hypocenter: Hypocenter;
    maxScale: number;
  };
  points?: QuakePoint[];
}

const ENDPOINT = "https://api.p2pquake.net/v2/history?codes=551&limit=10";

export async function fetchRecentQuakes(): Promise<QuakeEvent[]> {
  const res = await fetch(ENDPOINT, {
    headers: { "User-Agent": "q-awake/0.1 (+https://github.com/)" },
  });
  if (!res.ok) throw new Error(`P2P API ${res.status}`);
  return (await res.json()) as QuakeEvent[];
}
