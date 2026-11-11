"use client";

import { useEffect, useRef, useState } from "react";
import AlignedPhoto, { type PhotoTransform } from "./AlignedPhoto";
import type { Stroke } from "@/lib/db";
import { clamp } from "@/lib/utils";
import { useFrame34 } from "@/lib/useFrame34";
import { IconCheck, IconGuides, IconRotate, IconUndo, IconX } from "./icons";

interface P {
  x: number;
  y: number;
}

// Editor de alineacion: arrastre (1 dedo/raton), pellizco para zoom y giro
// con dos dedos (Pointer Events nativos). La foto se ve exactamente como
// quedara en el timeline: mismo componente AlignedPhoto y misma matematica.
export default function PhotoAligner({
  previewSrc,
  baseWidth,
  baseHeight,
  initial,
  guides,
  onSave,
  onCancel,
}: {
  previewSrc: string;
  baseWidth: number;
  baseHeight: number;
  initial?: Partial<PhotoTransform>;
  guides: Stroke[];
  onSave: (t: { scale: number; rotation: number; offset_x: number; offset_y: number }) => void;
  onCancel: () => void;
}) {
  const [scale, setScale] = useState(initial?.scale ?? 1);
  const [rotation, setRotation] = useState(initial?.rotation ?? 0);
  const [offsetX, setOffsetX] = useState(initial?.offset_x ?? 0);
  const [offsetY, setOffsetY] = useState(initial?.offset_y ?? 0);
  const [showGuides, setShowGuides] = useState(true);

  const frameRef = useRef<HTMLDivElement>(null);
  const { boxRef, size } = useFrame34();
  const pointers = useRef(new Map<number, P>());
  const gesture = useRef<{ dist: number; angle: number } | null>(null);
  const state = useRef({ scale, rotation, offsetX, offsetY });
  state.current = { scale, rotation, offsetX, offsetY };

  function frameRect(): DOMRect | null {
    return frameRef.current?.getBoundingClientRect() ?? null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = frameRect();
    if (!rect) return;

    if (pointers.current.size === 1) {
      const dx = (e.clientX - prev.x) / rect.width;
      const dy = (e.clientY - prev.y) / rect.height;
      setOffsetX((v) => clamp(v + dx, -0.5, 0.5));
      setOffsetY((v) => clamp(v + dy, -0.5, 0.5));
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      // Ratio y delta calculados en el evento: leer gesture.current dentro
      // del updater funcional es una carrera (React lo aplica despues, con el
      // ref ya avanzado) y el pellizco se anulaba en dispositivos reales.
      const ratio = gesture.current.dist > 0 ? dist / gesture.current.dist : 1;
      let da = angle - gesture.current.angle;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      gesture.current = { dist, angle };
      setScale((v) => clamp(v * ratio, 1, 5));
      setRotation((v) => clamp(v + da, -180, 180));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  useEffect(() => {
    const prevent = (e: TouchEvent) => e.preventDefault();
    const el = frameRef.current;
    el?.addEventListener("touchmove", prevent, { passive: false });
    return () => el?.removeEventListener("touchmove", prevent);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={onCancel}
          aria-label="Cancelar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
        >
          <IconX className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 px-2 text-center">
          <div className="truncate text-sm font-semibold">Alinear foto</div>
          <div className="truncate text-[11px] text-zinc-500">Arrastra · Pellizca · Gira</div>
        </div>
        <button
          onClick={() =>
            onSave({
              scale: state.current.scale,
              rotation: state.current.rotation,
              offset_x: state.current.offsetX,
              offset_y: state.current.offsetY,
            })
          }
          className="flex h-10 items-center gap-1.5 rounded-full bg-lime-400 px-4 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95"
        >
          <IconCheck className="h-4 w-4" />
          Guardar
        </button>
      </div>

      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={frameRef}
          className="touch-none"
          style={{ width: size.w, height: size.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-full w-full rounded-2xl ring-2 ring-lime-400/30">
            <AlignedPhoto
              srcUrl={previewSrc}
              transform={{
                width: baseWidth,
                height: baseHeight,
                scale,
                rotation,
                offset_x: offsetX,
                offset_y: offsetY,
              }}
              guides={guides}
              showGuides={showGuides}
            />
          </div>
        </div>
      </div>

      <div className="mx-3 mb-3 space-y-3 rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="w-10">Zoom</span>
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-lime-400"
          />
          <span className="w-11 text-right tabular-nums">{scale.toFixed(2)}x</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRotation((r) => clamp(r - 1, -180, 180))}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-zinc-800 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95"
          >
            <IconRotate className="h-3.5 w-3.5 -scale-x-100" />
            -1°
          </button>
          <button
            onClick={() => setRotation((r) => clamp(r + 1, -180, 180))}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-zinc-800 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95"
          >
            <IconRotate className="h-3.5 w-3.5" />
            +1°
          </button>
          <button
            onClick={() => {
              setScale(1);
              setRotation(0);
              setOffsetX(0);
              setOffsetY(0);
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-zinc-800 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95"
          >
            <IconUndo className="h-3.5 w-3.5" />
            Reiniciar
          </button>
          <button
            onClick={() => setShowGuides((v) => !v)}
            aria-label="Guías"
            className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95 ${
              showGuides ? "bg-zinc-700 text-lime-300" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            <IconGuides className="h-3.5 w-3.5" />
            Guías
          </button>
        </div>
      </div>
    </div>
  );
}
