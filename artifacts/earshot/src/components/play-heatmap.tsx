import { useEffect, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";

interface HeatmapData {
  mediaId: number;
  duration: number;
  buckets: number[];
  rawCounts: number[];
}

async function fetchHeatmap(mediaId: number): Promise<HeatmapData> {
  return customFetch(`/api/media/${mediaId}/play-heatmap`);
}

/**
 * Single wavy line — one continuous stroke whose amplitude shows replay intensity.
 */
export function PlayHeatmap({
  mediaId,
  className,
}: {
  mediaId: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<HeatmapData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHeatmap(mediaId).then((data) => {
      if (!cancelled) {
        dataRef.current = data;
        draw();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  function draw() {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = 40;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const buckets = data.buckets;
    const n = buckets.length;
    const step = cssW / (n - 1 || 1);
    const mid = cssH / 2;
    const maxH = (cssH - 6) / 2;

    const points: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const h = Math.max(0.5, maxH * buckets[i]);
      // Alternate above and below centre for wave effect
      const dir = i % 2 === 0 ? -1 : 1;
      points.push([i * step, mid + dir * h]);
    }

    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";

    ctx.beginPath();
    if (points.length > 0) {
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 0; i < points.length - 1; i++) {
        const cpx = (points[i][0] + points[i + 1][0]) / 2;
        ctx.bezierCurveTo(
          cpx, points[i][1],
          cpx, points[i + 1][1],
          points[i + 1][0], points[i + 1][1],
        );
      }
    }
    ctx.stroke();
  }

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: 40 }}
      aria-label="Replay waveform showing most replayed seconds"
    />
  );
}
