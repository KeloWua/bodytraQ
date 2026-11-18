"use client";

import { useState } from "react";
import { fmtDate, kgToLb, lbToKg, todayISO } from "@/lib/utils";

export default function CheckInForm({
  occupiedDates,
  initialDate,
  initialWeightKg,
  initialNotes,
  initialWaistCm,
  unit,
  onSave,
  onCancel,
}: {
  occupiedDates: string[];
  initialDate?: string;
  initialWeightKg?: number | null;
  initialNotes?: string;
  initialWaistCm?: number | null;
  unit: "kg" | "lb";
  onSave: (date: string, weightKg: number | null, notes: string, waistCm: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const today = todayISO();
  const [date, setDate] = useState(initialDate ?? (occupiedDates.includes(today) ? "" : today));
  const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const monthTitle = new Date(year, monthNumber - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  function changeMonth(delta: number) {
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  const [weight, setWeight] = useState(
    initialWeightKg != null
      ? String(unit === "lb" ? kgToLb(initialWeightKg) : initialWeightKg)
      : "",
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [waist, setWaist] = useState(initialWaistCm != null ? String(initialWaistCm) : "");
  const [showMeasures, setShowMeasures] = useState(initialWaistCm != null);

  async function submit() {
    if (saving) return;
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Elige un día disponible en el calendario."); return; }
    if (!initialDate && date > todayISO()) { setError("No puedes crear registros en el futuro."); return; }
    if (!initialDate && occupiedDates.includes(date)) { setError("Ya tienes un registro de ese día. Ábrelo para editarlo o añadir fotos."); return; }
    const w = weight.trim() === "" ? null : Number(weight.replace(",", "."));
    if (w !== null && (!Number.isFinite(w) || w <= 0 || w >= 1000)) { setError("Introduce un peso válido."); return; }
    const wc = waist.trim() === "" ? null : Number(waist.replace(",", "."));
    if (wc !== null && (!Number.isFinite(wc) || wc <= 0 || wc >= 300)) { setError("Introduce una cintura válida (cm)."); return; }
    setSaving(true);
    try {
      await onSave(date, w === null ? null : unit === "lb" ? lbToKg(w) : w, notes.trim(), wc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="bt-sheet-up max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-t-3xl bg-zinc-900 p-6 ring-1 ring-white/10 sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
        <h2 className="mb-3 text-lg font-bold tracking-tight">
          {initialDate ? "Editar registro" : "Nuevo registro"}
        </h2>
        <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
          Fecha
        </label>
        {initialDate ? (
          <p className="mb-4 text-sm text-zinc-300">{fmtDate(initialDate)} · La fecha se conserva.</p>
        ) : (
          <div className="mb-4 rounded-xl bg-zinc-800/70 p-2 ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Mes anterior" onClick={() => changeMonth(-1)} className="h-11 w-11 rounded-lg bg-zinc-700/50">‹</button>
              <span className="text-sm font-semibold capitalize" aria-live="polite">{monthTitle}</span>
              <button type="button" aria-label="Mes siguiente" disabled={month >= today.slice(0, 7)} onClick={() => changeMonth(1)} className="h-11 w-11 rounded-lg bg-zinc-700/50 disabled:opacity-25">›</button>
            </div>
            <div className="grid grid-cols-7 text-center">
              {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i} className="py-1 text-xs text-zinc-400" aria-hidden="true">{d}</span>)}
              {Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}
              {Array.from({ length: dayCount }, (_, i) => {
                const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                const future = day > today;
                const occupied = occupiedDates.includes(day);
                const reason = future ? "Fecha futura" : occupied ? "Ya tienes un registro de ese día" : "Disponible";
                return <button key={day} type="button" disabled={future || occupied || saving}
                  aria-label={`${fmtDate(day)}: ${reason}`} aria-pressed={date === day}
                  title={reason} onClick={() => { setDate(day); setError(""); }}
                  className={`relative h-11 min-w-0 rounded-lg text-sm disabled:cursor-not-allowed disabled:text-zinc-600 ${date === day ? "bg-lime-400 font-bold text-black" : "text-zinc-200 enabled:hover:bg-zinc-700"}`}>
                  {i + 1}{occupied && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-zinc-500" />}
                </button>;
              })}
            </div>
            <p className="mt-1 text-xs text-zinc-400">Días futuros y registrados desactivados. Para añadir fotos o editar un día registrado, ábrelo en la pantalla principal.</p>
            <p className="mt-2 text-sm text-lime-300" aria-live="polite">{date ? fmtDate(date) : "Elige un día disponible"}</p>
          </div>
        )}
        <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
          Peso ({unit})
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={unit === "lb" ? "176,4" : "80"}
          className="mb-4 w-full min-h-11 rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
        <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
          Notas (opcional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mb-5 w-full min-h-11 rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
        <button
          type="button"
          onClick={() => setShowMeasures((v) => !v)}
          aria-expanded={showMeasures}
          className="mb-3 text-sm font-semibold text-zinc-300 underline decoration-zinc-600 underline-offset-4"
        >
          {showMeasures ? "Ocultar medidas" : "Añadir medidas (opcional)"}
        </button>
        {showMeasures && (
          <>
            <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
              Cintura (cm)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              placeholder="85"
              className="mb-4 w-full min-h-11 rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
            />
          </>
        )}
        {error && <p role="alert" className="mb-3 text-sm text-amber-300">{error}</p>}
        <div className="flex gap-3">
          <button
            disabled={saving}
            onClick={onCancel}
            className="flex-1 rounded-full bg-zinc-800 py-3 text-sm font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            Cancelar
          </button>
          <button
            disabled={saving || !date}
            onClick={submit}
            className="flex-1 rounded-full bg-lime-400 py-3 text-sm font-bold text-black shadow-lg shadow-lime-400/20 transition active:scale-95 disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {initialDate && (
          <p className="mt-4 text-center text-xs text-zinc-500">{fmtDate(initialDate)}</p>
        )}
      </div>
    </div>
  );
}
