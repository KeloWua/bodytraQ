"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckIn, ViewProfile } from "@/lib/db";
import { photosOf } from "@/lib/db";
import { objectUrl } from "@/lib/storage";
import AlignedPhoto, { type PhotoTransform } from "./AlignedPhoto";
import { IconChevronL, IconChevronR, IconX } from "./icons";

interface CompareState {
  scale: number;
  offset_x: number;
  offset_y: number;
}

function defaultZoom(): CompareState {
  return { scale: 1, offset_x: 0, offset_y: 0 };
}

export default function CompareSheet({
  views,
  checkIns,
  onClose,
}: {
  views: ViewProfile[];
  checkIns: CheckIn[];
  onClose: () => void;
}) {
  // Vista seleccionada
  const [viewId, setViewId] = useState<string>(views[0]?.id ?? "");

  // Fechas disponibles (con foto en la vista)
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Fecha A (antigua) y B (reciente)
  const [dateA, setDateA] = useState<string>("");
  const [dateB, setDateB] = useState<string>("");

  // Fotos cargadas
  const [photoA, setPhotoA] = useState<{ url: string; transform: PhotoTransform } | null>(null);
  const [photoB, setPhotoB] = useState<{ url: string; transform: PhotoTransform } | null>(null);

  // Divisor 0..1
  const [dividerX, setDividerX] = useState(0.5);

  // Zoom sincronizado
  const [zoom, setZoom] = useState<CompareState>(defaultZoom);

  // Referencias para gestos
  const viewerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; zoom: CompareState } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: CompareState } | null>(null);

  // Cargar fechas disponibles al cambiar vista
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dates: string[] = [];
      for (const ci of checkIns.sort((a, b) => a.date.localeCompare(b.date))) {
        const rows = await photosOf(ci.id);
        const hasView = rows.some((p) => p.view_profile_id === viewId && !p.deleted_at);
        if (hasView) dates.push(ci.date);
      }
      if (!cancelled) setAvailableDates(dates);
    })();
    return () => { cancelled = true; };
  }, [viewId, checkIns]);

  // Seleccionar por defecto primera y última fecha
  useEffect(() => {
    if (availableDates.length === 0) {
      setDateA("");
      setDateB("");
      return;
    }
    const a = availableDates[0];
    const b = availableDates[availableDates.length - 1];
    setDateA(a);
    setDateB(b === a ? (availableDates.length > 1 ? availableDates[availableDates.length - 2] : a) : b);
  }, [availableDates]);

  // Cargar foto A
  useEffect(() => {
    let cancelled = false;
    let urlA: string | null = null;
    (async () => {
      const ci = checkIns.find((c) => c.date === dateA);
      if (!ci) { setPhotoA(null); return; }
      const rows = await photosOf(ci.id);
      const photo = rows.find((p) => p.view_profile_id === viewId && !p.deleted_at);
      if (!photo) { setPhotoA(null); return; }
      const url = await objectUrl(photo.display_path);
      if (!url || cancelled) return;
      urlA = url;
      setPhotoA({
        url,
        transform: {
          width: photo.width,
          height: photo.height,
          scale: photo.scale,
          rotation: photo.rotation,
          offset_x: photo.offset_x,
          offset_y: photo.offset_y,
        },
      });
    })();
    // Las URLs las gestiona la cache de storage.ts (objectUrl).
    // No revocar aquí: al cambiar fecha, objectUrl devuelve la URL cacheada.
    return () => { cancelled = true; };
  }, [dateA, viewId, checkIns]);

  // Cargar foto B
  useEffect(() => {
    let cancelled = false;
    let urlB: string | null = null;
    (async () => {
      const ci = checkIns.find((c) => c.date === dateB);
      if (!ci) { setPhotoB(null); return; }
      const rows = await photosOf(ci.id);
      const photo = rows.find((p) => p.view_profile_id === viewId && !p.deleted_at);
      if (!photo) { setPhotoB(null); return; }
      const url = await objectUrl(photo.display_path);
      if (!url || cancelled) return;
      urlB = url;
      setPhotoB({
        url,
        transform: {
          width: photo.width,
          height: photo.height,
          scale: photo.scale,
          rotation: photo.rotation,
          offset_x: photo.offset_x,
          offset_y: photo.offset_y,
        },
      });
    })();
    // Las URLs las gestiona la cache de storage.ts (objectUrl).
    // No revocar aquí: al cambiar fecha, objectUrl devuelve la URL cacheada.
    return () => { cancelled = true; };
  }, [dateB, viewId, checkIns]);

  // Las URLs las gestiona la cache de storage.ts (objectUrl).
  // No se revocan: clearUrlCache al bloquear y revokeUrl(path) al sustituir foto.

  // Divisor arrastrable
  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const el = viewerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const initialX = dividerX; // Capturar posición inicial

      const onMove = (clientX: number) => {
        const dx = clientX - startX;
        setDividerX(Math.max(0, Math.min(1, initialX + dx / rect.width)));
      };

      const onPointerMove = (ev: PointerEvent) => {
        ev.preventDefault();
        onMove(ev.clientX);
      };
      const onPointerUp = (ev: PointerEvent) => {
        ev.preventDefault();
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [dividerX],
  );

  // Zoom con botones
  const zoomIn = () => {
    setZoom((z) => ({ ...z, scale: Math.min(5, z.scale * 1.25) }));
  };
  const zoomOut = () => {
    setZoom((z) => ({ ...z, scale: Math.max(0.5, z.scale / 1.25) }));
  };
  const zoomReset = () => setZoom(defaultZoom());

  // Pan con pointer (un dedo)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target === dividerRef.current || dividerRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      panStart.current = { x: e.clientX, y: e.clientY, zoom: { ...zoom } };
      const el = viewerRef.current;
      if (!el) return;

      const onPointerMove = (ev: PointerEvent) => {
        ev.preventDefault();
        if (!panStart.current || !el) return;
        const rect = el.getBoundingClientRect();
        const dx = (ev.clientX - panStart.current.x) / rect.width;
        const dy = (ev.clientY - panStart.current.y) / rect.height;
        setZoom({
          scale: panStart.current.zoom.scale,
          offset_x: panStart.current.zoom.offset_x + dx,
          offset_y: panStart.current.zoom.offset_y + dy,
        });
      };
      const onPointerUp = (ev: PointerEvent) => {
        ev.preventDefault();
        panStart.current = null;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [zoom],
  );

  // Pinch-to-zoom (dos dedos)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        panStart.current = null; // Anular pan para que no pelee con pinch
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStart.current = { dist: Math.sqrt(dx * dx + dy * dy), zoom: { ...zoom } };
      }
    },
    [zoom],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = dist / pinchStart.current.dist;
        const newScale = Math.max(0.5, Math.min(5, pinchStart.current.zoom.scale * ratio));
        setZoom((z) => ({ ...z, scale: newScale }));
      }
    },
    [],
  );

  // Selector de fecha con flechas
  const dateIndex = (date: string) => availableDates.indexOf(date);
  const cycleDate = (which: "A" | "B", dir: number) => {
    const date = which === "A" ? dateA : dateB;
    const idx = dateIndex(date);
    const newIdx = Math.max(0, Math.min(availableDates.length - 1, idx + dir));
    const newDate = availableDates[newIdx];
    if (which === "A") setDateA(newDate);
    else setDateB(newDate);
  };

  const viewName = views.find((v) => v.id === viewId)?.name ?? "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="text-base font-bold text-zinc-100">Comparar fechas</h2>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition active:scale-95"
          aria-label="Cerrar"
        >
          <IconX />
        </button>
      </div>

      {/* Selector de vista */}
      {views.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewId(v.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ring-1 transition ${
                v.id === viewId
                  ? "bg-lime-400 text-black ring-lime-400"
                  : "bg-zinc-900 text-zinc-400 ring-white/10 active:scale-95"
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* Selector de fechas */}
      <div className="flex items-center justify-center gap-6 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => cycleDate("A", -1)}
            disabled={dateIndex(dateA) <= 0}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 disabled:opacity-30"
            aria-label="Fecha anterior A"
          >
            <IconChevronL />
          </button>
          <span className="min-w-[90px] text-center text-sm font-medium text-zinc-200 tabular-nums">
            {dateA ? new Date(dateA + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—"}
          </span>
          <button
            onClick={() => cycleDate("A", 1)}
            disabled={dateIndex(dateA) >= availableDates.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 disabled:opacity-30"
            aria-label="Fecha siguiente A"
          >
            <IconChevronR />
          </button>
        </div>
        <span className="text-xs text-zinc-500">vs</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cycleDate("B", -1)}
            disabled={dateIndex(dateB) <= 0}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 disabled:opacity-30"
            aria-label="Fecha anterior B"
          >
            <IconChevronL />
          </button>
          <span className="min-w-[90px] text-center text-sm font-medium text-zinc-200 tabular-nums">
            {dateB ? new Date(dateB + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—"}
          </span>
          <button
            onClick={() => cycleDate("B", 1)}
            disabled={dateIndex(dateB) >= availableDates.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 disabled:opacity-30"
            aria-label="Fecha siguiente B"
          >
            <IconChevronR />
          </button>
        </div>
      </div>

      {/* Visor con divisor */}
      <div
        ref={viewerRef}
        className="relative flex-1 overflow-hidden touch-none"
        style={{ cursor: panStart.current ? "grabbing" : "grab" }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {!photoA || !photoB ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            {availableDates.length < 2 ? "Necesitas al menos 2 fechas con foto en esta vista" : "Cargando…"}
          </div>
        ) : (
          /* Contenedor acotado a la caja de la foto (mismo aspect y redondeo que AlignedPhoto) */
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-zinc-900">
              {/* Capa A: siempre visible completa */}
              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${zoom.offset_x * 100}%, ${zoom.offset_y * 100}%) scale(${zoom.scale})`,
                  transformOrigin: "center center",
                }}
              >
                <div className="absolute inset-0">
                  <AlignedPhoto
                    srcUrl={photoA.url}
                    transform={photoA.transform}
                    showGuides={false}
                  />
                </div>
              </div>

              {/* Capa B: wrapper sin transform con clip-path, dentro tiene el mismo transform */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 0 0 ${dividerX * 100}%)` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${zoom.offset_x * 100}%, ${zoom.offset_y * 100}%) scale(${zoom.scale})`,
                    transformOrigin: "center center",
                  }}
                >
                  <AlignedPhoto
                    srcUrl={photoB.url}
                    transform={photoB.transform}
                    showGuides={false}
                  />
                </div>
              </div>

              {/* Divisor arrastrable — zona táctil amplia, línea fina, handle transparente */}
              <div
                ref={dividerRef}
                className="absolute top-0 bottom-0 w-10 bg-transparent cursor-col-resize -translate-x-1/2"
                style={{ left: `${dividerX * 100}%` }}
                onPointerDown={handleDividerPointerDown}
              >
                {/* Línea visual fina centrada */}
                <div className="mx-auto h-full w-px bg-lime-400/50" />
                {/* Botón central (handle) transparente */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-8 rounded-full bg-lime-400/10 ring-1 ring-white/20 shadow-lg flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-white/40 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Etiquetas de fecha en las esquinas */}
        {photoA && photoB && (
          <>
            <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              A
            </span>
            <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              B
            </span>
          </>
        )}

        {/* Controles de zoom */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            onClick={zoomIn}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-200 ring-1 ring-white/10 backdrop-blur-sm active:scale-95"
            aria-label="Acercar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button
            onClick={zoomOut}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-200 ring-1 ring-white/10 backdrop-blur-sm active:scale-95"
            aria-label="Alejar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M5 12h14" /></svg>
          </button>
          <button
            onClick={zoomReset}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/90 text-xs font-bold text-zinc-200 ring-1 ring-white/10 backdrop-blur-sm active:scale-95"
            aria-label="Restablecer zoom"
          >
            1:1
          </button>
        </div>
      </div>
    </div>
  );
}

