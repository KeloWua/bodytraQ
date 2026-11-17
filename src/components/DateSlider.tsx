"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CheckIn } from "@/lib/db";

export default function DateSlider({
  checkIns,
  index,
  onSelect,
}: {
  checkIns: CheckIn[];
  index: number;
  onSelect: (i: number) => void;
}) {
  if (checkIns.length === 0) return null;

  const total = checkIns.length;

  // Parse dates in UTC to avoid timezone shifts
  const dates = useMemo(
    () =>
      checkIns.map((c) =>
        Date.UTC(
          parseInt(c.date.slice(0, 4), 10),
          parseInt(c.date.slice(5, 7), 10) - 1,
          parseInt(c.date.slice(8, 10), 10)
        )
      ),
    [checkIns]
  );

  const firstTs = dates[0];
  const lastTs = dates[total - 1];
  const spanDays = Math.max(1, Math.round((lastTs - firstTs) / (24 * 60 * 60 * 1000)));

  // Position each check-in by calendar distance from first
  const positions = useMemo(() => {
    if (total === 1) return [0.5];
    return dates.map((ts) => (ts - firstTs) / (lastTs - firstTs || 1));
  }, [dates, firstTs, lastTs, total]);

  // Day N label: days from first record + 1 (first is always "Día 1")
  const dayLabels = useMemo(
    () =>
      dates.map(
        (ts) => Math.round((ts - firstTs) / (24 * 60 * 60 * 1000)) + 1
      ),
    [dates, firstTs]
  );

  // Short date: d MMM (es)
  const shortDates = useMemo(() => {
    return dates.map((ts) => {
      const d = new Date(ts);
      return d.toLocaleDateString("es", { day: "numeric", month: "short" });
    });
  }, [dates]);

  const [hovered, setHovered] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handlePointerMove(e);
    },
    // positions is stable; use a ref-based approach for positions
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      // Find nearest point
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const d = Math.abs(positions[i] - x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      setHovered(best);
    },
    [positions]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    if (hovered !== null) {
      onSelect(hovered);
    }
  }, [hovered, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onSelect(Math.max(0, index - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onSelect(Math.min(total - 1, index + 1));
      }
    },
    [index, total, onSelect]
  );

  // Current context label
  const currentDay = dayLabels[index];
  const currentDate = shortDates[index];

  return (
    <div className="flex flex-col gap-1.5">
      {/* Track with dots */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext={`Día ${currentDay} — ${currentDate}`}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-8 w-full cursor-pointer touch-none"
        style={{ touchAction: "none" }}
      >
        {/* Track line */}
        <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-zinc-700" />

        {/* Dots */}
        {positions.map((pos, i) => {
          const leftPct = total === 1 ? 50 : pos * 100;
          const isActive = i === index;
          const isHovered = i === hovered;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 transition-transform"
              style={{ left: `${leftPct}%`, transform: `translate(-50%, -50%)` }}
            >
              <div
                className={`rounded-full transition-all ${
                  isActive
                    ? "h-3 w-3 bg-lime-400 ring-2 ring-lime-400/50"
                    : isHovered
                    ? "h-2.5 w-2.5 bg-lime-400/80"
                    : "h-2 w-2 bg-zinc-500"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Context label */}
      <p className="text-center text-xs text-zinc-400">
        Día {currentDay} — {currentDate}
      </p>
    </div>
  );
}
