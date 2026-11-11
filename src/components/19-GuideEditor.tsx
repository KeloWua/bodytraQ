"use client";

import { useRef, useState } from "react";
import AlignedPhoto, { GuideLayer, type PhotoTransform } from "./AlignedPhoto";
import { useFrame34 } from "@/lib/useFrame34";
import type { Stroke } from "@/lib/db";
import { IconBrush, IconCheck, IconLine, IconPhoto, IconTrash, IconUndo, IconX } from "./icons";

// Editor de guias: lineas rectas y pincel libre sobre el marco 3:4, con
// coordenadas normalizadas 0.0-1.0 (setup.md, fase 2). Se pueden dibujar
// sobre una foto base (la ultima de esa vista) o sobre el marco vacio.
export default function GuideEditor({
  viewName,
  initial,
  backdropUrl,
  backdropTransform,
  onSave,
  onCancel,
}: {
  viewName: string;
  initial: Stroke[];
  backdropUrl: string | null;
  backdropTransform: PhotoTransform | null;
  onSave: (strokes: Stroke[]) => void;
  onCancel: () => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial);
  const [tool, setTool] = useState<"line" | "path">("line");
  const [showBackdrop, setShowBackdrop] = useState(!!backdropUrl);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { boxRef, size } = useFrame34();
  const drawing = useRef(false);

  function norm(e: React.PointerEvent<HTMLDivElement>): [number, number] | null {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const p = norm(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    setDraft(tool === "line" ? { type: "line", points: [p, p] } : { type: "path", points: [p] });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawing.current) return;
    const p = norm(e);
    if (!p) return;
    setDraft((d) => {
      if (!d) return d;
      if (d.type === "line") return { type: "line", points: [d.points[0], p] };
      return { type: "path", points: [...d.points, p] };
    });
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    setDraft((d) => {
      if (d && d.points.length >= 2) setStrokes((s) => [...s, d]);
      return null;
    });
  }

  const shown = draft ? [...strokes, draft] : strokes;

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
          <div className="truncate text-sm font-semibold">Guías: {viewName}</div>
          <div className="truncate text-[11px] text-zinc-500">Dibuja líneas de referencia</div>
        </div>
        <button
          onClick={() => onSave(strokes)}
          className="flex h-10 items-center gap-1.5 rounded-full bg-lime-400 px-4 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95"
        >
          <IconCheck className="h-4 w-4" />
          Guardar
        </button>
      </div>

      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={frameRef}
          className="relative touch-none"
          style={{ width: size.w, height: size.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {showBackdrop && backdropUrl && backdropTransform ? (
            <AlignedPhoto srcUrl={backdropUrl} transform={backdropTransform} />
          ) : (
            <div className="h-full w-full rounded-2xl bg-zinc-900 ring-1 ring-white/10" />
          )}
          <div className="absolute inset-0">
            <GuideLayer strokes={shown} />
          </div>
        </div>
      </div>

      <div className="mx-3 mb-3 space-y-3 rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex rounded-full bg-zinc-800 p-1 ring-1 ring-white/10">
          <button
            onClick={() => setTool("line")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition ${
              tool === "line" ? "bg-lime-400 text-black" : "text-zinc-400"
            }`}
          >
            <IconLine className="h-3.5 w-3.5" />
            Línea
          </button>
          <button
            onClick={() => setTool("path")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition ${
              tool === "path" ? "bg-lime-400 text-black" : "text-zinc-400"
            }`}
          >
            <IconBrush className="h-3.5 w-3.5" />
            Pincel
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStrokes((s) => s.slice(0, -1))}
            className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-800 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95"
          >
            <IconUndo className="h-3.5 w-3.5" />
            Deshacer
          </button>
          <button
            onClick={() => setStrokes([])}
            className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-800 py-2.5 text-xs font-medium text-red-300 ring-1 ring-white/10 transition active:scale-95"
          >
            <IconTrash className="h-3.5 w-3.5" />
            Borrar todo
          </button>
          {backdropUrl && (
            <button
              onClick={() => setShowBackdrop((v) => !v)}
              className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95 ${
                showBackdrop ? "bg-zinc-700 text-lime-300" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              <IconPhoto className="h-3.5 w-3.5" />
              {showBackdrop ? "Con foto" : "Sin foto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
