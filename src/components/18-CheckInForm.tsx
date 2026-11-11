"use client";

import { useState } from "react";
import { fmtDate, kgToLb, lbToKg, todayISO } from "@/lib/utils";

export default function CheckInForm({
  initialDate,
  initialWeightKg,
  initialNotes,
  unit,
  onSave,
  onCancel,
}: {
  initialDate?: string;
  initialWeightKg?: number | null;
  initialNotes?: string;
  unit: "kg" | "lb";
  onSave: (date: string, weightKg: number | null, notes: string) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [weight, setWeight] = useState(
    initialWeightKg != null
      ? String(unit === "lb" ? kgToLb(initialWeightKg) : initialWeightKg)
      : "",
  );
  const [notes, setNotes] = useState(initialNotes ?? "");

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const w = weight.trim() === "" ? null : Number(weight.replace(",", "."));
    if (w !== null && (!Number.isFinite(w) || w <= 0 || w >= 1000)) return;
    onSave(date, w === null ? null : unit === "lb" ? lbToKg(w) : w, notes.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="bt-sheet-up w-full max-w-md rounded-t-3xl bg-zinc-900 p-6 ring-1 ring-white/10 sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
        <h2 className="mb-5 text-lg font-bold tracking-tight">
          {initialDate ? "Editar registro" : "Nuevo registro"}
        </h2>
        <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
          Fecha
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
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
          className="mb-4 w-full rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
        <label className="mb-1.5 block text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
          Notas (opcional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mb-5 w-full rounded-xl bg-zinc-800/70 px-4 py-3 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full bg-zinc-800 py-3 text-sm font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            className="flex-1 rounded-full bg-lime-400 py-3 text-sm font-bold text-black shadow-lg shadow-lime-400/20 transition active:scale-95"
          >
            Guardar
          </button>
        </div>
        {initialDate && (
          <p className="mt-4 text-center text-xs text-zinc-500">{fmtDate(initialDate)}</p>
        )}
      </div>
    </div>
  );
}
