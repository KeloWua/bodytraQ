"use client";

import type { CheckIn } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { IconX } from "./icons";

const PURGE_DAYS = 30;

function daysRemaining(deletedAt: string | null): number {
  if (!deletedAt) return PURGE_DAYS;
  const deleted = new Date(deletedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - deleted) / (24 * 60 * 60 * 1000));
  return Math.max(0, PURGE_DAYS - elapsed);
}

export default function TrashView({
  trashed,
  onRestore,
  onDeleteForever,
  onEmptyTrash,
  onClose,
}: {
  trashed: CheckIn[];
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onEmptyTrash: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="bt-sheet-up h-full w-full max-w-md overflow-y-auto bg-zinc-900 p-5 ring-1 ring-white/10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Papelera</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            <IconX className="h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>

        {trashed.length === 0 ? (
          <div className="rounded-2xl bg-zinc-800/40 p-6 text-center ring-1 ring-white/5">
            <p className="text-sm text-zinc-400">La papelera está vacía.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              <button
                onClick={onEmptyTrash}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-500/20 py-2.5 text-sm font-medium text-red-300 ring-1 ring-red-500/30 transition active:scale-95"
              >
                Vaciar papelera
              </button>
            </div>

            <div className="space-y-3">
              {trashed.map((item) => {
                const days = daysRemaining(item.deleted_at);
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-zinc-800/40 p-4 ring-1 ring-white/5"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-200">
                        {fmtDate(item.date)}
                      </span>
                      <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                        Se elimina en {days} día{days !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {item.weight_kg !== null && item.weight_kg !== undefined && (
                      <p className="mb-2 text-xs text-zinc-400">
                        Peso: {item.weight_kg} kg
                      </p>
                    )}

                    {item.notes && (
                      <p className="mb-2 line-clamp-2 text-xs text-zinc-500">
                        {item.notes}
                      </p>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => onRestore(item.id)}
                        className="flex-1 rounded-full bg-lime-400 py-2 text-sm font-bold text-black transition active:scale-95"
                      >
                        Restaurar
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Eliminar definitivamente el registro del ${fmtDate(item.date)}? Esta acción no se puede deshacer.`
                            )
                          ) {
                            onDeleteForever(item.id);
                          }
                        }}
                        className="flex-1 rounded-full bg-red-500/20 py-2 text-sm font-medium text-red-300 ring-1 ring-red-500/30 transition active:scale-95"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
