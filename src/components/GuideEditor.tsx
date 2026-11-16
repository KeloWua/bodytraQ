"use client";

import { useEffect, useRef, useState } from "react";
import AlignedPhoto, { GuideLayer, type PhotoTransform } from "./AlignedPhoto";
import { processImageFile } from "@/lib/images";
import { useFrame34 } from "@/lib/useFrame34";
import type { Stroke } from "@/lib/db";
import { IconBrush, IconCheck, IconLine, IconPhoto, IconTrash, IconUndo, IconX } from "./icons";

const MIN_STROKE = 0.01;

function strokeLength(s: Stroke): number {
  let total = 0;
  for (let i = 1; i < s.points.length; i++) {
    total += Math.hypot(s.points[i][0] - s.points[i - 1][0], s.points[i][1] - s.points[i - 1][1]);
  }
  return total;
}

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
      // Un toque sin arrastrar dejaba una linea de longitud 0 (invisible):
      // se descarta si mide menos del 1% del marco.
      if (d && d.points.length >= 2 && strokeLength(d) >= MIN_STROKE) setStrokes((s) => [...s, d]);
      return null;
    });
  }

  // Foto base temporal: solo memoria del editor, nunca OPFS ni registro.
  const [temporaryBase, setTemporaryBase] = useState<{ url: string; transform: PhotoTransform } | null>(null);
  const [baseError, setBaseError] = useState("");
  const [loadingBase, setLoadingBase] = useState(false);
  const temporaryUrl = useRef<string | null>(null);
  const alive = useRef(true);
  const baseInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (temporaryUrl.current) URL.revokeObjectURL(temporaryUrl.current);
    };
  }, []);
  const baseUrl = temporaryBase?.url ?? backdropUrl;
  const baseTransform = temporaryBase?.transform ?? backdropTransform;
  async function chooseBase(file: File) {
    setLoadingBase(true);
    setBaseError("");
    try {
      const image = await processImageFile(file);
      if (!alive.current) return;
      const url = URL.createObjectURL(image.display);
      if (temporaryUrl.current) URL.revokeObjectURL(temporaryUrl.current);
      temporaryUrl.current = url;
      setTemporaryBase({ url, transform: { width: image.width, height: image.height, scale: 1, rotation: 0, offset_x: 0, offset_y: 0 } });
      setShowBackdrop(true);
    } catch {
      if (alive.current) setBaseError("No se pudo abrir esa imagen. Prueba con una foto JPG o PNG.");
    } finally { if (alive.current) setLoadingBase(false); }
  }
  const shown = draft ? [...strokes, draft] : strokes;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={onCancel}
          aria-label="Cancelar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
        >
          <IconX className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 px-2 text-center">
          <div className="truncate text-sm font-semibold">Guías: {viewName}</div>
          <div className="truncate text-[11px] text-zinc-500">Dibuja líneas de referencia</div>
        </div>
        <button
          disabled={loadingBase}
          onClick={() => onSave(strokes)}
          className="flex h-11 items-center gap-1.5 rounded-full bg-lime-400 px-4 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95"
        >
          <IconCheck className="h-4 w-4" />
          Guardar
        </button>
      </div>

      {initial.length === 0 && (
        <div className="mx-3 rounded-xl bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <button disabled={loadingBase} onClick={() => baseInput.current?.click()} className="min-h-11 rounded-full bg-zinc-800 px-4 font-semibold text-lime-300">
            {loadingBase ? "Abriendo foto…" : temporaryBase ? "Cambiar foto base temporal" : "Elegir foto base para la primera guía"}
          </button>
          <p className="mt-1">Dibuja sobre una foto. Al guardar quedan solo las líneas: este fondo no se añade al seguimiento ni modifica el original.</p>
          {baseError && <p role="alert" className="mt-1 text-amber-300">{baseError}</p>}
          <input ref={baseInput} type="file" accept="image/*,.heic,.heif" className="hidden" aria-label="Foto base temporal" onChange={(e) => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (file) void chooseBase(file);
          }} />
        </div>
      )}
      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={frameRef}
          className="relative touch-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
          style={{ width: size.w, height: size.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {showBackdrop && baseUrl && baseTransform ? (
            <AlignedPhoto srcUrl={baseUrl} transform={baseTransform} />
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
          {baseUrl && (
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
