"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke } from "@/lib/db";
import { GuideLayer } from "./AlignedPhoto";
import { useFrame34 } from "@/lib/useFrame34";
import { IconCamera, IconGuides, IconRotate, IconX } from "./icons";

type Facing = "environment" | "user";

type CamError = "denied" | "unavailable" | "other";

// Camara en directo con las guias del perfil dibujadas encima (overlay SVG).
// La captura recorta el fotograma al mismo marco 3:4 que ve el usuario, de
// modo que lo que se encuadra con las guias es exactamente lo que se guarda.
// Tras capturar, la foto sigue el flujo normal (procesado + alineador), asi
// siempre se puede reajustar antes de guardar.
export default function CameraCapture({
  guides,
  onCapture,
  onCancel,
  onUseFile,
}: {
  guides: Stroke[];
  onCapture: (file: File) => void;
  onCancel: () => void;
  onUseFile: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<CamError | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const { boxRef, size } = useFrame34();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("unavailable");
        return;
      }
      try {
        // Solo ideales, sin exact: un exact de resolucion rompe en varios
        // iOS con OverconstrainedError. La camara trasera es la habitual
        // para estas fotos; el boton de giro cambia a la frontal.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          // playsInline + muted son imprescindibles en iOS: sin playsInline
          // Safari abre la camara a pantalla completa nativa (sin overlay).
          await v.play().catch(() => undefined);
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") setError("denied");
        else if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError")
          setError("unavailable");
        else setError("other");
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, stopStream]);

  function handleCancel() {
    stopStream();
    onCancel();
  }

  async function handleCapture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || capturing) return;
    setCapturing(true);
    try {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      // Recorte "cover" al marco 3:4, identico al object-cover de la vista
      // previa: si el video es mas ancho que 3:4 se recortan los lados; si
      // es mas alto, arriba/abajo, siempre centrado.
      const target = 3 / 4;
      let sw: number, sh: number, sx: number, sy: number;
      if (vw / vh > target) {
        sh = vh;
        sw = Math.round(vh * target);
        sx = Math.round((vw - sw) / 2);
        sy = 0;
      } else {
        sw = vw;
        sh = Math.round(vw / target);
        sx = 0;
        sy = Math.round((vh - sh) / 2);
      }
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D no disponible");
      const mirror = facing === "user";
      if (mirror) {
        // La frontal se previsualiza en espejo; la captura se guarda tal
        // cual se veia para que coincida con las guias.
        ctx.translate(sw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("No se pudo codificar la captura");
      const file = new File([blob], `camara-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      onCapture(file);
    } catch {
      setCapturing(false);
      setError("other");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={handleCancel}
          aria-label="Cancelar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
        >
          <IconX className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 px-2 text-center">
          <div className="truncate text-sm font-semibold">Cámara con guías</div>
          <div className="truncate text-[11px] text-zinc-500">Encuadra dentro de las líneas</div>
        </div>
        <button
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Cambiar de cámara"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
        >
          <IconRotate className="h-4.5 w-4.5" />
        </button>
      </div>

      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          className="relative overflow-hidden rounded-2xl bg-zinc-900 ring-2 ring-lime-400/30"
          style={{ width: size.w, height: size.h }}
        >
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <IconCamera className="h-8 w-8 text-zinc-600" />
              <p className="text-sm text-zinc-300">
                {error === "denied"
                  ? "Sin permiso de cámara. Actívalo en los ajustes del navegador para esta web."
                  : error === "unavailable"
                    ? "No se pudo abrir la cámara en este navegador."
                    : "La cámara falló al iniciarse."}
              </p>
              <button
                onClick={() => {
                  stopStream();
                  onUseFile();
                }}
                className="rounded-full bg-lime-400 px-5 py-2.5 text-sm font-bold text-black transition active:scale-95"
              >
                Subir o hacer foto normal
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`absolute inset-0 h-full w-full object-cover ${
                  facing === "user" ? "-scale-x-100" : ""
                }`}
              />
              {showGuides && <GuideLayer strokes={guides} />}
            </>
          )}
        </div>
      </div>

      <div className="mx-3 mb-3 space-y-3 rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGuides((v) => !v)}
            aria-label="Guías"
            className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95 ${
              showGuides ? "bg-zinc-700 text-lime-300" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            <IconGuides className="h-3.5 w-3.5" />
            Guías
          </button>
          <button
            onClick={handleCapture}
            disabled={Boolean(error) || capturing}
            aria-label="Capturar foto"
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-lime-400 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95 disabled:opacity-40"
          >
            <IconCamera className="h-5 w-5" />
            {capturing ? "Capturando…" : "Capturar"}
          </button>
        </div>
        <p className="text-center text-[11px] text-zinc-500">
          La foto se recorta al marco y luego puedes reajustarla como siempre.
        </p>
      </div>
    </div>
  );
}
