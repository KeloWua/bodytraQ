"use client";

import { useCallback, useMemo, useRef } from "react";
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

  // Position each check-in by calendar distance from first
  const positions = useMemo(() => {
    if (total === 0) return [];
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

  // Short date: d MMM (es), UTC timezone
  const shortDates = useMemo(() => {
    return dates.map((ts) => {
      const d = new Date(ts);
      return d.toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });
    });
  }, [dates]);

  // Ref for current positions so pointer handlers always read fresh values
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const trackRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<number | null>(null);

  const findNearest = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    // Track has internal padding: left-2 right-2 (0.5rem = 8px each side)
    const padding = 8;
    const trackWidth = rect.width - padding * 2;
    const x = Math.max(0, Math.min(1, (clientX - rect.left - padding) / trackWidth));
    const pos = positionsRef.current;
    if (pos.length === 0) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pos.length; i++) {
      const d = Math.abs(pos[i] - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const nearest = findNearest(e.clientX);
      selectedRef.current = nearest;
      onSelect(nearest);
    },
    [findNearest, onSelect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      // Only update while capture is active (selectedRef tracks this)
      if (selectedRef.current === null) return;
      const nearest = findNearest(e.clientX);
      selectedRef.current = nearest;
      onSelect(nearest);
    },
    [findNearest, onSelect]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      // Recalculate nearest from current pointer position
      const nearest = findNearest(e.clientX);
      selectedRef.current = nearest;
      onSelect(nearest);
      selectedRef.current = null;
    },
    [findNearest, onSelect]
  );

  const handlePointerCancel = useCallback(() => {
    selectedRef.current = null;
  }, []);

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
  const currentDay = total > 0 ? dayLabels[index] : 1;
  const currentDate = total > 0 ? shortDates[index] : "";

  if (total === 0) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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
        onPointerCancel={handlePointerCancel}
        className="relative h-8 w-full cursor-pointer touch-none"
        style={{ touchAction: "none" }}
      >
        {/* Track line */}
        <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-zinc-700" />

        {/* Dots */}
        {positions.map((pos, i) => {
          const isActive = i === index;
          // Align dots with track padding: 8px inset on each side
          const leftStyle = total === 1
            ? "50%"
            : `calc(8px + (100% - 16px) * ${pos})`;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: leftStyle, transform: `translate(-50%, -50%)` }}
            >
              <div
                className={`rounded-full transition-all ${
                  isActive
                    ? "h-3 w-3 bg-lime-400 ring-2 ring-lime-400/50"
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
