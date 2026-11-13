"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckIn, Photo, Settings, ViewProfile } from "@/lib/db";
import { photosOf } from "@/lib/db";
import { objectUrl } from "@/lib/storage";
import { bmi, fmtDate, kgToLb } from "@/lib/utils";
import AlignedPhoto from "./AlignedPhoto";
import {
  IconCamera,
  IconChevronL,
  IconChevronR,
  IconGear,
  IconGuides,
  IconPencil,
  IconPlus,
} from "./icons";

function parseGuides(json: string) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Timeline: navega por fechas con flechas, teclado y swipe; muestra 1 o 2
// vistas con la misma matematica 3:4 del editor; precarga fechas adyacentes
// para que el timelapse no parpadee.
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
  onOpenSettings: () => void;
  refreshKey: number;
}) {
  const [layout, setLayout] = useState(settings.default_layout);
  const [singleViewId, setSingleViewId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [showGuides, setShowGuides] = useState(true);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const current: CheckIn | null = checkIns[index] ?? null;

  const shownViews = useMemo(() => {
    if (layout === "dual" && views.length >= 2) return views.slice(0, 2);
    const chosen = views.find((v) => v.id === singleViewId) ?? views[0];
    return chosen ? [chosen] : [];
  }, [layout, views, singleViewId]);

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
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
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
          className="text-sm text-zinc-400 underline underline-offset-4"
        >
          Ajustes
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col"
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
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
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-base font-bold tracking-tight">
            Body<span className="text-lime-400">TRAQ</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onEditCheckIn}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
            >
              <IconPencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              onClick={onOpenSettings}
              aria-label="Ajustes"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
            >
              <IconGear className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
        <div className="pb-3 text-center">
          {settings.show_date && current && (
            <div className="text-sm font-semibold">{fmtDate(current.date)}</div>
          )}
          <div className="text-xs text-zinc-400 tabular-nums">
            {settings.show_weight && weightLabel()}
            {settings.show_weight && settings.show_bmi && weightLabel() && bmiLabel() ? " · " : ""}
            {settings.show_bmi && bmiLabel()}
          </div>
        </div>
      </header>

      <div className="flex items-center justify-center gap-2 px-3 pt-3 pb-1">
        {views.length > 1 && (
          <div className="flex rounded-full bg-zinc-900 p-1 ring-1 ring-white/10">
            {(["single", "dual"] as const).map((l, i) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`h-7 w-7 rounded-full text-xs font-semibold transition ${
                  layout === l ? "bg-lime-400 text-black" : "text-zinc-400"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
        {layout === "single" && views.length > 1 && (
          <div className="flex rounded-full bg-zinc-900 p-1 ring-1 ring-white/10">
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => setSingleViewId(v.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  (singleViewId ?? views[0]?.id) === v.id
                    ? "bg-lime-400 text-black"
                    : "text-zinc-400"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowGuides((v) => !v)}
          aria-label="Guías"
          className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/10 transition active:scale-95 ${
            showGuides ? "bg-zinc-800 text-lime-400" : "bg-zinc-900 text-zinc-500"
          }`}
        >
          <IconGuides className="h-4.5 w-4.5" />
        </button>
      </div>

      {current?.notes.trim() && (
        <section className="mx-3 mt-3 min-w-0 rounded-2xl bg-zinc-900/70 p-3 ring-1 ring-white/10">
          <h2 id="timeline-notes-heading" className="mb-1 text-xs font-medium text-zinc-400">
            Notas del registro
          </h2>
          <div
            key={current.id}
            role="region"
            aria-labelledby="timeline-notes-heading"
            tabIndex={0}
            className="max-h-32 overflow-y-auto overscroll-contain rounded-sm text-sm leading-relaxed whitespace-pre-wrap text-zinc-300 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400"
          >
            {current.notes}
          </div>
        </section>
      )}

      <main
        className={`grid flex-1 content-center gap-3 px-3 pt-2 pb-4 ${
          shownViews.length === 2 ? "grid-cols-2" : "mx-auto w-full max-w-md grid-cols-1"
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
                      {storageOk ? "Añadir foto" : "Sin OPFS: fotos no disponibles"}
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

      <nav className="sticky bottom-0 z-20 border-t border-white/5 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-3">
          <button
            onClick={() => go(-1)}
            disabled={index <= 0}
            aria-label="Fecha anterior"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10 transition active:scale-95 disabled:opacity-30"
          >
            <IconChevronL />
          </button>
          <button
            onClick={onNewCheckIn}
            className="flex items-center gap-2 rounded-full bg-lime-400 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95"
          >
            <IconPlus className="h-4 w-4" />
            Nuevo registro
          </button>
          <button
            onClick={() => go(1)}
            disabled={index >= checkIns.length - 1}
            aria-label="Fecha siguiente"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10 transition active:scale-95 disabled:opacity-30"
          >
            <IconChevronR />
          </button>
        </div>
      </nav>
    </div>
  );
}
