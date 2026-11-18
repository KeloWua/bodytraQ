"use client";

import { useMemo, useState } from "react";
import type { CheckIn, Settings } from "@/lib/db";
import { IconChart } from "./icons";
import { MEASUREMENT_FIELDS, spansMultipleYears, type MeasurementKey } from "@/lib/utils";

type RangeKey = "1M" | "3M" | "6M" | "1A" | "Todo";
type MetricKey = "weight" | MeasurementKey;

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

function fmtValue(value: number, unitLabel: string): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${unitLabel}`;
}

// Referencias OMS de cintura para hombres adultos (ejemplo para población
// caucásica): orientativas, no un diagnóstico ni un ideal estético.
const WAIST_REFS: { value: number; label: string }[] = [
  { value: 94, label: "OMS: riesgo aumentado (hombres)" },
  { value: 102, label: "OMS: riesgo alto (hombres)" },
];

export default function EvolutionView({
  checkIns,
  settings,
}: {
  checkIns: CheckIn[];
  settings: Settings;
}) {
  const [range, setRange] = useState<RangeKey>("Todo");
  const [metric, setMetric] = useState<MetricKey>("weight");

  const metricLabel =
    metric === "weight" ? "Peso" : MEASUREMENT_FIELDS.find((f) => f.key === metric)!.label;
  const unitLabel = metric === "weight" ? settings.weight_unit : "cm";
  const refs = metric === "waist_cm" ? WAIST_REFS : [];

  const points = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const cutoffMs = range === "Todo"
      ? null
      : todayMs - (RANGES.find((r) => r.key === range)!.days ?? 0) * 24 * 60 * 60 * 1000;

    return checkIns
      .map((c) => {
        const raw = metric === "weight" ? c.weight_kg : (c[metric] ?? null);
        const value = raw == null ? null : metric === "weight" ? kgToDisplay(raw, settings.weight_unit) : raw;
        return {
          date: c.date,
          value,
          ts: Date.UTC(
            parseInt(c.date.slice(0, 4), 10),
            parseInt(c.date.slice(5, 7), 10) - 1,
            parseInt(c.date.slice(8, 10), 10)
          ),
        };
      })
      .filter((p): p is { date: string; value: number; ts: number } =>
        p.value != null && (cutoffMs === null || p.ts >= cutoffMs)
      )
      .sort((a, b) => a.ts - b.ts);
  }, [checkIns, range, metric, settings.weight_unit]);

  const currentValue = points.length > 0 ? points[points.length - 1].value : null;
  const delta = points.length >= 2 ? points[points.length - 1].value - points[0].value : null;

  return (
    <div className="flex min-h-full flex-col px-4 pt-6 pb-4">
      <h2 className="mb-4 text-xl font-bold tracking-tight">Evolución</h2>

      {/* Selector de métrica */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setMetric("weight")}
          className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${
            metric === "weight"
              ? "bg-lime-400 text-black"
              : "bg-zinc-800 text-zinc-400 ring-1 ring-white/10"
          }`}
        >
          Peso
        </button>
        {MEASUREMENT_FIELDS.map((f) => (
          <button
            key={f.key}
            onClick={() => setMetric(f.key)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${
              metric === f.key
                ? "bg-lime-400 text-black"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-white/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Rango de fechas */}
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

      {/* Valor actual + cambio */}
      {currentValue != null && (
        <div className="mb-4">
          <p className="text-2xl font-bold">{fmtValue(currentValue, unitLabel)}</p>
          {delta != null && (
            <p className="mt-1 text-sm text-zinc-400">
              {delta >= 0 ? `+${fmtValue(delta, unitLabel)}` : fmtValue(delta, unitLabel)}{" "}
              desde el inicio
            </p>
          )}
        </div>
      )}

      {/* Gráfica o estado vacío */}
      {points.length < 2 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <IconChart className="h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Aún no hay suficientes registros con {metricLabel.toLowerCase()} en este periodo.
          </p>
        </div>
      ) : (
        <>
          <MetricChart points={points} refs={refs} />
          {refs.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Líneas punteadas: referencias OMS orientativas para hombres adultos. No son un
              diagnóstico ni un objetivo universal.
            </p>
          ) : metric !== "weight" ? (
            <p className="mt-2 text-xs text-zinc-500">
              No hay una referencia de salud universal para esta medida: la gráfica muestra tu
              evolución personal.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG chart: polilinea con eje X por fecha real, etiquetas ligeras  */
/* ------------------------------------------------------------------ */

function MetricChart({
  points,
  refs,
}: {
  points: { date: string; value: number; ts: number }[];
  refs: { value: number; label: string }[];
}) {
  const pad = { top: 16, right: 12, bottom: 36, left: 36 };
  const w = 340;
  const h = 220;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  const minV = Math.min(...values, ...(refs.length ? refs.map((r) => r.value) : []));
  const maxV = Math.max(...values, ...(refs.length ? refs.map((r) => r.value) : []));
  const rangeV = maxV - minV || 1;
  const yMin = minV - rangeV * 0.15;
  const yMax = maxV + rangeV * 0.15;

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsRange = maxTs - minTs || 1;

  const x = (ts: number) => pad.left + ((ts - minTs) / tsRange) * innerW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const polylinePoints = points.map((p) => `${x(p.ts)},${y(p.value)}`).join(" ");

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

  const fmtAxis = (v: number) => `${Math.round(v * 10) / 10}`;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label="Gráfica de evolución"
      >
        {/* Grid lines (light) */}
        <line x1={pad.left} y1={pad.top} x2={w - pad.right} y2={pad.top} className="stroke-zinc-700" strokeWidth={0.5} />
        <line x1={pad.left} y1={h - pad.bottom} x2={w - pad.right} y2={h - pad.bottom} className="stroke-zinc-700" strokeWidth={0.5} />

        {/* Reference lines */}
        {refs.map((r) => (
          <g key={r.value}>
            <line
              x1={pad.left}
              y1={y(r.value)}
              x2={w - pad.right}
              y2={y(r.value)}
              className="stroke-amber-400/70"
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={w - pad.right}
              y={y(r.value) - 4}
              textAnchor="end"
              className="fill-amber-300/80"
              fontSize={9}
            >
              {r.label} · {r.value}
            </text>
          </g>
        ))}

        {/* Y-axis labels (min/max) */}
        <text x={pad.left - 6} y={y(yMax) + 4} textAnchor="end" className="fill-zinc-500" fontSize={11}>
          {fmtAxis(yMax)}
        </text>
        <text x={pad.left - 6} y={y(yMin) + 4} textAnchor="end" className="fill-zinc-500" fontSize={11}>
          {fmtAxis(yMin)}
        </text>

        {/* X-axis date labels */}
        <text x={x(minTs)} y={h - 10} textAnchor="start" className="fill-zinc-500" fontSize={11}>
          {fmtDate(minTs)}
        </text>
        <text x={x(maxTs)} y={h - 10} textAnchor="end" className="fill-zinc-500" fontSize={11}>
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
        {points.map((p, i) => (
          <circle key={i} cx={x(p.ts)} cy={y(p.value)} r={3} className="fill-lime-400" />
        ))}
      </svg>
    </div>
  );
}
