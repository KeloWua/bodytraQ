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
  const [showExport, setShowExport] = useState(false);
  const [expPeso, setExpPeso] = useState(true);
  const [expCambio, setExpCambio] = useState(true);
  const [expFechas, setExpFechas] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  async function downloadPng() {
    setExporting(true);
    try {
      const svg = buildExportSvg(points, unit, {
        peso: expPeso, cambio: expCambio, fechas: expFechas,
      });
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 520;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 800, 520);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `bodytraq-evolucion-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } finally {
      setExporting(false);
    }
  }

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

      {/* Current weight + delta */}
      {currentWeight != null && (
        <div className="mb-4">
          <p className="text-2xl font-bold">
            {fmtWeight(kgToDisplay(currentWeight, unit), unit)}
          </p>
          {delta != null && (
            <p className="mt-1 text-sm text-zinc-400">
              {delta >= 0 ? `+${fmtWeight(kgToDisplay(delta, unit), unit)}` : fmtWeight(kgToDisplay(delta, unit), unit)}{" "}
              desde el inicio
            </p>
          )}
        </div>
      )}

      {/* Exportar imagen privada: el usuario elige qué incluir */}
      {points.length >= 2 && (
        <div className="mb-4">
          <button
            onClick={() => setShowExport((v) => !v)}
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            {showExport ? "Cerrar exportación" : "Exportar imagen"}
          </button>
          {showExport && (
            <div className="mt-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/10">
              <p className="mb-3 text-sm font-semibold text-zinc-200">¿Qué incluye la imagen?</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ["Peso actual", expPeso, setExpPeso],
                  ["Cambio", expCambio, setExpCambio],
                  ["Fechas", expFechas, setExpFechas],
                ] as const).map(([label, val, set]) => (
                  <button
                    key={label}
                    onClick={() => set(!val)}
                    aria-pressed={val}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 transition ${
                      val
                        ? "bg-lime-400 text-black ring-lime-400"
                        : "bg-zinc-800 text-zinc-400 ring-white/10"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={downloadPng}
                disabled={exporting}
                className="mt-3 w-full rounded-full bg-lime-400 px-4 py-2 text-sm font-bold text-black transition active:scale-95 disabled:opacity-50"
              >
                {exporting ? "Generando…" : "Descargar PNG"}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                La imagen se genera y descarga en tu dispositivo. Nada se sube.
              </p>
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

/* ------------------------------------------------------------------ */
/*  SVG exportable de la gráfica (imagen privada, render local)        */
/* ------------------------------------------------------------------ */

function buildExportSvg(
  points: { date: string; weightKg: number; ts: number }[],
  unit: "kg" | "lb",
  opts: { peso: boolean; cambio: boolean; fechas: boolean }
): string {
  const pad = { top: 56, right: 16, bottom: 40, left: 44 };
  const w = 400, h = 260;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const weights = points.map((p) => kgToDisplay(p.weightKg, unit));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const rangeW = maxW - minW || 1;
  const yMin = minW - rangeW * 0.15;
  const yMax = maxW + rangeW * 0.15;
  const minTs = points[0].ts, maxTs = points[points.length - 1].ts;
  const tsRange = maxTs - minTs || 1;
  const x = (ts: number) => pad.left + ((ts - minTs) / tsRange) * innerW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const showYear = spansMultipleYears(points.map((p) => p.date));
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("es", {
      day: "numeric", month: "short",
      ...(showYear ? { year: "2-digit" as const } : {}),
      timeZone: "UTC",
    });
  const fmtAx = (v: number) => `${Math.round(v * 10) / 10}`;

  const pts = points.map((p) => `${x(p.ts)},${y(kgToDisplay(p.weightKg, unit))}`).join(" ");
  const dots = points
    .map((p) => `<circle cx="${x(p.ts)}" cy="${y(kgToDisplay(p.weightKg, unit))}" r="3" fill="#a3e635"/>`)
    .join("");

  const last = weights[weights.length - 1];
  const delta = weights.length >= 2 ? last - weights[0] : null;
  const arrow = delta == null ? "" : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

  const header: string[] = [`<text x="${pad.left}" y="30" fill="#fafafa" font-size="18" font-weight="700" font-family="system-ui, sans-serif">Evolución del peso</text>`];
  if (opts.peso) {
    header.push(`<text x="${pad.left}" y="50" fill="#a1a1aa" font-size="13" font-family="system-ui, sans-serif">Actual: ${Math.round(last * 10) / 10} ${unit}</text>`);
  }
  if (opts.cambio && delta != null) {
    header.push(`<text x="${pad.left + (opts.peso ? 130 : 0)}" y="50" fill="#a1a1aa" font-size="13" font-family="system-ui, sans-serif">${arrow} ${Math.round(Math.abs(delta) * 10) / 10} ${unit}</text>`);
  }

  const fechas = opts.fechas
    ? `<text x="${pad.left}" y="${h - 12}" fill="#a1a1aa" font-size="11" font-family="system-ui, sans-serif">${fmtDate(minTs)}</text>` +
      `<text x="${w - pad.right}" y="${h - 12}" text-anchor="end" fill="#a1a1aa" font-size="11" font-family="system-ui, sans-serif">${fmtDate(maxTs)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#09090b"/>
${header.join("\n")}
<line x1="${pad.left}" y1="${pad.top}" x2="${w - pad.right}" y2="${pad.top}" stroke="#3f3f46" stroke-width="0.5"/>
<line x1="${pad.left}" y1="${h - pad.bottom}" x2="${w - pad.right}" y2="${h - pad.bottom}" stroke="#3f3f46" stroke-width="0.5"/>
${opts.peso ? `<text x="${pad.left - 6}" y="${y(yMax) + 4}" text-anchor="end" fill="#71717a" font-size="11" font-family="system-ui, sans-serif">${fmtAx(yMax)}</text>
<text x="${pad.left - 6}" y="${y(yMin) + 4}" text-anchor="end" fill="#71717a" font-size="11" font-family="system-ui, sans-serif">${fmtAx(yMin)}</text>` : ""}
<polyline points="${pts}" fill="none" stroke="#a3e635" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
${fechas}
</svg>`;
}
