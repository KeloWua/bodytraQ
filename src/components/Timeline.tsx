"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckIn, Photo, Settings, ViewProfile } from "@/lib/db";
import { photosOf } from "@/lib/db";
import { objectUrl } from "@/lib/storage";
import { bmi, fmtDate, kgToLb, spansMultipleYears , MEASUREMENT_FIELDS} from "@/lib/utils";
import AlignedPhoto from "./AlignedPhoto";
import {
  IconCamera,
  IconChevronL,
  IconChevronR,
  IconGear,
  IconGuides,
  IconPencil,
  IconTrash,
} from "./icons";

function parseGuides(json: string) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Timeline: navega por fechas con flechas, teclado y swipe; muestra de 1 a 4
// vistas a la vez (se elige aqui o en Ajustes > "¿Como quieres ver tus
// fotos?") con la misma matematica 3:4 del editor; precarga fechas adyacentes
// para que el timelapse no parpadee. El numero solo fija cuantas vistas se
// ven a la vez: con 1 la lista de vistas se desplaza en horizontal y con 2 o
// mas las flechas deslizan una ventana vista a vista (1-2, 2-3, 3-4...), asi
// ninguna vista queda fuera de alcance.
export default function Timeline({
  settings,
  views,
  checkIns,
  index,
  storageOk,
  onIndex,
  onAddPhoto,
  onEditPhoto,
  onNewCheckIn,
  onEditCheckIn,
  onMoveToTrash,
  onOpenSettings,
  refreshKey,
}: {
  settings: Settings;
  views: ViewProfile[];
  checkIns: CheckIn[];
  index: number;
  storageOk: boolean;
  onIndex: (i: number) => void;
  onAddPhoto: (viewId: string) => void;
  onEditPhoto: (photo: Photo) => void;
  onNewCheckIn: () => void;
  onEditCheckIn: () => void;
  onMoveToTrash: (id: string) => void;
  onOpenSettings: () => void;
  refreshKey: number;
}) {
  const clampCount = (n: number, total: number) =>
    Math.max(1, Math.min(4, Math.min(total, Math.round(n) || 1)));
  const [count, setCount] = useState(() =>
    clampCount(settings.photos_per_view, Math.max(1, views.length)),
  );
  const [singleViewId, setSingleViewId] = useState<string | null>(null);
  const [winStart, setWinStart] = useState(0);

  // Si el ajuste cambia en Ajustes, el timeline lo refleja al instante.
  useEffect(() => {
    setCount(clampCount(settings.photos_per_view, Math.max(1, views.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.photos_per_view]);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [showGuides, setShowGuides] = useState(true);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const current: CheckIn | null = checkIns[index] ?? null;

  // Ventana deslizante: nunca deja fuera vistas del final; se clampa si se
  // borran vistas o cambia el numero de fotos para no quedar fuera de rango.
  const maxWinStart = Math.max(0, views.length - count);
  const curWinStart = Math.min(winStart, maxWinStart);

  const shownViews = useMemo(() => {
    if (count >= 2 && views.length >= 2) {
      return views.slice(curWinStart, curWinStart + count);
    }
    const chosen = views.find((v) => v.id === singleViewId) ?? views[0];
    return chosen ? [chosen] : [];
  }, [count, views, singleViewId, curWinStart]);

  // Botones 1..4 del selector rapido, limitados a las vistas disponibles.
  const countOptions = [1, 2, 3, 4].filter((n) => n <= Math.max(1, views.length));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!current) {
        setPhotos(new Map());
        return;
      }
      const rows = await photosOf(current.id);
      const map = new Map(rows.map((p) => [p.view_profile_id, p]));
      const urlMap = new Map<string, string>();
      for (const p of rows) {
        const u = await objectUrl(p.display_path);
        if (u) urlMap.set(p.id, u);
      }
      if (!cancelled) {
        setPhotos(map);
        setUrls(urlMap);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [current, refreshKey]);

  useEffect(() => {
    async function prefetch() {
      for (const i of [index - 1, index + 1]) {
        const c = checkIns[i];
        if (!c) continue;
        const rows = await photosOf(c.id);
        for (const p of rows) await objectUrl(p.display_path);
      }
    }
    void prefetch();
  }, [index, checkIns, refreshKey]);

  const go = (delta: number) => {
    const next = Math.min(checkIns.length - 1, Math.max(0, index + delta));
    if (next !== index) onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // La lista esta ordenada ascendente: indice menor = fecha mas antigua.
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function weightLabel(): string | null {
    if (!current?.weight_kg) return null;
    if (settings.weight_unit === "lb") return `${kgToLb(current.weight_kg)} lb`;
    return `${current.weight_kg} kg`;
  }

  function bmiLabel(): string | null {
    if (!current?.weight_kg || !settings.height_cm) return null;
    return `IMC ${bmi(current.weight_kg, settings.height_cm)}`;
  }

  if (checkIns.length === 0) {
    return (
      <div className="relative z-10 flex min-h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
          <IconCamera className="h-9 w-9 text-lime-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Empieza tu seguimiento</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Crea tu primer registro con fecha y peso, y sube tus fotos alineadas.
          </p>
        </div>
        <button
          onClick={onNewCheckIn}
          className="rounded-full bg-lime-400 px-8 py-3.5 font-semibold text-black shadow-lg shadow-lime-400/20 transition active:scale-95"
        >
          Crear el primer registro
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="min-h-11 px-3 text-sm text-zinc-400 underline underline-offset-4"
        >
          Ajustes
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative z-10 flex min-h-full flex-col"
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerCancel={() => {
        // Si el gesto acaba siendo scroll vertical, el navegador cancela el
        // puntero: hay que olvidar el swipe para no navegar fechas despues.
        swipe.current = null;
      }}
      onPointerUp={(e) => {
        if (!swipe.current) return;
        const dx = e.clientX - swipe.current.x;
        const dy = e.clientY - swipe.current.y;
        swipe.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx > 0) go(-1); // swipe a la derecha = fecha mas antigua
          else go(1);
        }
      }}
    >
      <header className="sticky top-0 z-20 border-b border-white/5 bg-zinc-950/70 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3">
          <span className="text-base font-bold tracking-tight">
            Body<span className="text-lime-400">TRAQ</span>
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={onEditCheckIn}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 min-h-11 px-3.5 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
            >
              <IconPencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              onClick={() => {
                if (current && window.confirm("¿Mover este registro a la papelera?")) {
                  onMoveToTrash(current.id);
                }
              }}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 min-h-11 px-3.5 py-2 text-xs font-medium text-red-300 ring-1 ring-white/10 transition active:scale-95"
            >
              <IconTrash className="h-3.5 w-3.5" />
              Papelera
            </button>
            <button
              onClick={onOpenSettings}
              aria-label="Ajustes"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
            >
              <IconGear className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
        <div className="pb-3 text-center">
          {settings.show_date && current && (
            <div className="text-sm font-semibold">{fmtDate(current.date, spansMultipleYears(checkIns.map((c) => c.date)))}</div>
          )}
          <div className="text-xs text-zinc-400 tabular-nums">
            {[
              settings.show_weight ? weightLabel() : null,
              settings.show_bmi ? bmiLabel() : null,
              ...(settings.show_weight && current
                ? MEASUREMENT_FIELDS.map((f) => {
                    const v = current[f.key];
                    return v != null ? `${f.label} ${v} cm` : null;
                  })
                : []),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-3 pb-1">
        {views.length > 1 && countOptions.length > 1 && (
          <div className="flex shrink-0 rounded-full bg-zinc-900 p-1 ring-1 ring-white/10">
            {countOptions.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                aria-label={`Ver ${n} foto${n > 1 ? "s" : ""} a la vez`}
                className={`h-11 w-11 rounded-full text-xs font-semibold transition ${
                  count === n ? "bg-lime-400 text-black" : "text-zinc-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {count === 1 && views.length > 1 && (
          // La fila de vistas se desplaza en horizontal: con muchas vistas
          // ninguna queda cortada fuera de la pantalla.
          <div className="flex min-w-0 flex-1 overflow-x-auto rounded-full bg-zinc-900 p-1 ring-1 ring-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="m-auto flex">
              {views.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSingleViewId(v.id)}
                  className={`min-h-11 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    (singleViewId ?? views[0]?.id) === v.id
                      ? "bg-lime-400 text-black"
                      : "text-zinc-400"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {count >= 2 && views.length > count && (
          // Con mas vistas que huecos, las flechas deslizan la ventana vista
          // a vista (1-2, 2-3, 3-4...): el numero limita cuantas se ven a la
          // vez, no cuales se pueden alcanzar.
          <div className="flex shrink-0 items-center rounded-full bg-zinc-900 p-1 ring-1 ring-white/10">
            <button
              onClick={() => setWinStart((s) => Math.max(0, s - 1))}
              disabled={curWinStart <= 0}
              aria-label="Vistas anteriores"
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition active:scale-95 disabled:opacity-30"
            >
              <IconChevronL />
            </button>
            <span className="px-1 text-xs font-medium text-zinc-400 tabular-nums">
              {curWinStart + 1}-{Math.min(curWinStart + count, views.length)}/{views.length}
            </span>
            <button
              onClick={() => setWinStart((s) => Math.min(maxWinStart, s + 1))}
              disabled={curWinStart >= maxWinStart}
              aria-label="Vistas siguientes"
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition active:scale-95 disabled:opacity-30"
            >
              <IconChevronR />
            </button>
          </div>
        )}
        <button
          onClick={() => setShowGuides((v) => !v)}
          aria-label="Guías"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-white/10 transition active:scale-95 ${
            showGuides ? "bg-zinc-800 text-lime-400" : "bg-zinc-900 text-zinc-500"
          }`}
        >
          <IconGuides className="h-4.5 w-4.5" />
        </button>
      </div>

      <main
        className={`grid flex-1 content-center gap-3 px-3 pt-2 pb-4 ${
          shownViews.length === 4
            ? "mx-auto w-full max-w-md grid-cols-2 grid-rows-2"
            : shownViews.length === 3
              ? "grid-cols-3"
              : shownViews.length === 2
                ? "grid-cols-2"
                : "mx-auto w-full max-w-md grid-cols-1"
        }`}
      >
        {shownViews.map((v) => {
          const photo = current ? photos.get(v.id) : undefined;
          const url = photo ? (urls.get(photo.id) ?? null) : null;
          return (
            <div key={v.id} className="bt-fade-in">
              <AlignedPhoto
                srcUrl={url}
                onClick={photo ? () => onEditPhoto(photo) : undefined}
                transform={
                  photo
                    ? {
                        width: photo.width,
                        height: photo.height,
                        scale: photo.scale,
                        rotation: photo.rotation,
                        offset_x: photo.offset_x,
                        offset_y: photo.offset_y,
                      }
                    : null
                }
                guides={parseGuides(v.guides)}
                showGuides={showGuides}
                placeholder={
                  <button
                    onClick={() => storageOk && current && onAddPhoto(v.id)}
                    className={`flex flex-col items-center gap-2 p-4 ${
                      storageOk ? "" : "cursor-not-allowed opacity-40"
                    }`}
                  >
                    <IconCamera className={`h-8 w-8 ${storageOk ? "text-zinc-500" : "text-zinc-700"}`} />
                    <span className={`text-sm font-medium ${storageOk ? "text-lime-400" : "text-zinc-600"}`}>
                      {storageOk ? "Añadir foto" : "Fotos no disponibles (ver Ajustes)"}
                    </span>
                  </button>
                }
              />
              <p className="mt-1.5 text-center text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
                {v.name}
              </p>
            </div>
          );
        })}
      </main>

    </div>
  );
}
