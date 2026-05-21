import { onCleanup, onMount, createEffect, Accessor } from "solid-js";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { QuakeEvent } from "../lib/p2pquake";

const P_WAVE_KMS = 7;
const S_WAVE_KMS = 4;
const ANIM_DURATION_MS = 60_000;

function parseJstTime(s: string | undefined): number {
  if (!s) return NaN;
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]);
}

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  event: Accessor<QuakeEvent | null>;
}

export default function EarthquakeMap(props: Props) {
  let mapEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let map: MLMap | null = null;
  let raf = 0;
  let animStart = 0;
  let animating = false;
  let activeEvent: QuakeEvent | null = null;

  onMount(() => {
    map = new maplibregl.Map({
      container: mapEl,
      style: MAP_STYLE,
      center: [138.5, 37.5],
      zoom: 4.2,
      attributionControl: { compact: true },
    });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = mapEl;
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      const ctx = canvasEl.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    map.on("move", drawFrame);
    map.on("zoom", drawFrame);

    onCleanup(() => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      map?.remove();
    });
  });

  createEffect(() => {
    const ev = props.event();
    if (!ev || !map) return;
    activeEvent = ev;
    const { latitude, longitude } = ev.earthquake.hypocenter;
    map.flyTo({ center: [longitude, latitude], zoom: 6.2, speed: 1.2 });
    cancelAnimationFrame(raf);

    const epochMs = parseJstTime(ev.earthquake?.time);
    const ageMs = Number.isFinite(epochMs) ? Date.now() - epochMs : Infinity;

    if (ageMs >= ANIM_DURATION_MS) {
      animating = false;
      drawFrame();
      return;
    }

    // Anchor animStart so the loop's elapsed reflects real wall-clock age.
    animStart = performance.now() - Math.max(0, ageMs);
    animating = true;
    const loop = () => {
      drawFrame();
      if (animating && performance.now() - animStart < ANIM_DURATION_MS) {
        raf = requestAnimationFrame(loop);
      } else {
        animating = false;
        drawFrame();
      }
    };
    raf = requestAnimationFrame(loop);
  });

  function drawFrame() {
    if (!map || !canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    const { clientWidth: w, clientHeight: h } = mapEl;
    ctx.clearRect(0, 0, w, h);

    if (!activeEvent) return;
    const { latitude, longitude } = activeEvent.earthquake.hypocenter;
    const center = map.project([longitude, latitude]);

    if (animating) {
      const elapsed = (performance.now() - animStart) / 1000;
      if (elapsed >= 0) {
        const pxPerKm = pixelsPerKmAt(map, latitude);
        const pRadius = P_WAVE_KMS * elapsed * pxPerKm;
        const sRadius = S_WAVE_KMS * elapsed * pxPerKm;
        drawWave(ctx, center.x, center.y, pRadius, "rgba(120, 200, 255, ", elapsed, 60);
        drawWave(ctx, center.x, center.y, sRadius, "rgba(255, 90, 90, ", elapsed, 60);
      }
    }
    drawEpicenter(ctx, center.x, center.y, activeEvent.earthquake.hypocenter.magnitude);
  }

  return (
    <>
      <div id="map" ref={mapEl}></div>
      <canvas class="wave-overlay" ref={canvasEl}></canvas>
    </>
  );
}

function pixelsPerKmAt(map: MLMap, latitude: number): number {
  const a = map.project([0, latitude]);
  const b = map.project([0.1, latitude]);
  const pxDist = Math.hypot(a.x - b.x, a.y - b.y);
  const kmDist = (0.1 * 111.32) * Math.cos((latitude * Math.PI) / 180);
  return pxDist / kmDist;
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  colorPrefix: string,
  elapsed: number,
  fadeAfter: number,
) {
  const alpha = Math.max(0, 1 - elapsed / fadeAfter);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `${colorPrefix}${alpha.toFixed(3)})`;
  ctx.stroke();

  // Filled gradient to suggest a wavefront
  const grad = ctx.createRadialGradient(cx, cy, Math.max(0, radius - 18), cx, cy, radius);
  grad.addColorStop(0, `${colorPrefix}0)`);
  grad.addColorStop(1, `${colorPrefix}${(alpha * 0.18).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawEpicenter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  magnitude: number,
) {
  const r = 6 + Math.max(0, magnitude) * 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 230, 120, 0.95)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 230, 120, 1)";
  ctx.fill();
}
