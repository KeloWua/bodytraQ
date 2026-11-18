"use client";

import { useMemo, useState } from "react";
import type { CheckIn, Settings } from "@/lib/db";
import { IconChart } from "./icons";
import { spansMultipleYears } from "@/lib/utils";

type RangeKey = "1M" | "3M" | "6M" | "1A" | "Todo";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1A", label: "1A", days: 365 },
  { key: "Todo", label: "Todo", days: null },
];

function kgToDisplay(kg: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? kg * 2.20462 : kg;
}

function fmtWeight(value: number, unit: "kg" | "lb"): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

export default function EvolutionView({
  checkIns,
  settings,
}: {
  checkIns: CheckIn[];
  settings: Settings;
}) {
  const [range, setRange] = useState<RangeKey>("Todo");

  const points = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const cutoffMs = range === "Todo"
      ? null
      : todayMs - (RANGES.find((r) => r.key === range)!.days ?? 0) * 24 * 60 * 60 * 1000;

    return checkIns
      .filter((c) => {
        if (c.weight_kg == null || c.weight_kg <= 0) return false;
        const d = Date.UTC(
          parseInt(c.date.slice(0, 4), 10),
          parseInt(c.date.slice(5, 7), 10) - 1,
          parseInt(c.date.slice(8, 10), 10)
        );
        if (cutoffMs !== null && d < cutoffMs) return false;
        return true;
      })
      .map((c) => ({
        date: c.date,
        weightKg: c.weight_kg!,
        ts: Date.UTC(
          parseInt(c.date.slice(0, 4), 10),
          parseInt(c.date.slice(5, 7), 10) - 1,
          parseInt(c.date.slice(8, 10), 10)
        ),
      }))
      .sort((a, b) => a.ts - b.ts);
  }, [checkIns, range]);

  const currentWeight = points.length > 0 ? points[points.length - 1].weightKg : null;
  const delta =
    points.length >= 2
      ? points[points.length - 1].weightKg - points[0].weightKg
      : null;

  const unit = settings.weight_unit;

  const daysInRange =
    points.length >= 2
      ? Math.round((points[points.length - 1].ts - points[0].ts) / 86400000)
      : 0;
  const weeklyRate =
    delta != null && daysInRange >= 7
      ? Math.round((kgToDisplay(delta, unit) / (daysInRange / 7)) * 10) / 10
      : null;

  return (
    <div className="flex min-h-full flex-col px-4 pt-6 pb-4">
      <h2 className="mb-4 text-xl font-bold tracking-tight">Evolución del peso</h2>

      {/* Range chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${
              range === r.key
                ? "bg-lime-400 text-black"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-white/10"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Resumen del rango visible: actual + cambio neutro + contexto */}
      {currentWeight != null && (
        <div className="mb-4">
          <p className="text-2xl font-bold">
            {fmtWeight(kgToDisplay(currentWeight, unit), unit)}
          </p>
          {delta != null && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-sm font-semibold text-zinc-200 ring-1 ring-white/10">
                <span aria-hidden="true">{delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2192"}</span>
                {fmtWeight(Math.abs(kgToDisplay(delta, unit)), unit)}
              </span>
              <span className="text-sm text-zinc-400">
                {points.length} registros · {daysInRange} días
                {weeklyRate != null && ` · ${weeklyRate >= 0 ? "+" : ""}${weeklyRate} ${unit}/sem`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chart or empty state */}
      {points.length < 2 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <IconChart className="h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Aún no hay suficientes registros con peso en este periodo.
          </p>
        </div>
      ) : (
        <WeightChart points={points} unit={unit} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG chart: polilinea con eje X por fecha real, etiquetas ligeras  */
/* ------------------------------------------------------------------ */

function WeightChart({
  points,
  unit,
}: {
  points: { date: string; weightKg: number; ts: number }[];
  unit: "kg" | "lb";
}) {
  const pad = { top: 16, right: 12, bottom: 36, left: 36 };
  const w = 340;
  const h = 220;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const weights = points.map((p) => kgToDisplay(p.weightKg, unit));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const rangeW = maxW - minW || 1;
  const yMin = minW - rangeW * 0.15;
  const yMax = maxW + rangeW * 0.15;

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsRange = maxTs - minTs || 1;

  const x = (ts: number) => pad.left + ((ts - minTs) / tsRange) * innerW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const polylinePoints = points.map((p) => {
    const v = kgToDisplay(p.weightKg, unit);
    return `${x(p.ts)},${y(v)}`;
  }).join(" ");

  // Format date labels: d MMM, con año corto si el rango cruza años.
  const showYear = spansMultipleYears(points.map((p) => p.date));
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("es", {
      day: "numeric",
      month: "short",
      ...(showYear ? { year: "2-digit" as const } : {}),
      timeZone: "UTC",
    });
  };

  const fmtAxis = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return `${r}`;
  };

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label="Gráfica de evolución del peso"
      >
        {/* Grid lines (light) */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={w - pad.right}
          y2={pad.top}
          className="stroke-zinc-700"
          strokeWidth={0.5}
        />
        <line
          x1={pad.left}
          y1={h - pad.bottom}
          x2={w - pad.right}
          y2={h - pad.bottom}
          className="stroke-zinc-700"
          strokeWidth={0.5}
        />

        {/* Y-axis labels (min/max) */}
        <text
          x={pad.left - 6}
          y={y(yMax) + 4}
          textAnchor="end"
          className="fill-zinc-500"
          fontSize={11}
        >
          {fmtAxis(yMax)}
        </text>
        <text
          x={pad.left - 6}
          y={y(yMin) + 4}
          textAnchor="end"
          className="fill-zinc-500"
          fontSize={11}
        >
          {fmtAxis(yMin)}
        </text>

        {/* X-axis date labels */}
        <text
          x={x(minTs)}
          y={h - 10}
          textAnchor="start"
          className="fill-zinc-500"
          fontSize={11}
        >
          {fmtDate(minTs)}
        </text>
        <text
          x={x(maxTs)}
          y={h - 10}
          textAnchor="end"
          className="fill-zinc-500"
          fontSize={11}
        >
          {fmtDate(maxTs)}
        </text>

        {/* Polyline */}
        <polyline
          points={polylinePoints}
          fill="none"
          className="stroke-lime-400"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots */}
        {points.map((p, i) => {
          const v = kgToDisplay(p.weightKg, unit);
          return (
            <circle
              key={i}
              cx={x(p.ts)}
              cy={y(v)}
              r={3}
              className="fill-lime-400"
            />
          );
        })}
      </svg>
    </div>
  );
}
