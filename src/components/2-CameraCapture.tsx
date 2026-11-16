"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke } from "@/lib/db";
import { GuideLayer, GhostPhoto } from "./AlignedPhoto";
import { listGuidePhotos, type GuidePhoto } from "@/lib/guidePhotos";
import { objectUrl } from "@/lib/storage";
import { useFrame34 } from "@/lib/useFrame34";
import { IconCamera, IconGuides, IconPhoto, IconRotate, IconTimer, IconX } from "./icons";

type Facing = "environment" | "user";

type CamError = "denied" | "unavailable" | "other";

const TIMER_OPTIONS = [0, 3, 10] as const;
type TimerSec = (typeof TIMER_OPTIONS)[number];

// Camara en directo con las guias del perfil dibujadas encima (overlay SVG).
// La captura recorta el fotograma al mismo marco 3:4 que ve el usuario, de
// modo que lo que se encuadra con las guias es exactamente lo que se guarda.
// Tras capturar, la foto sigue el flujo normal (procesado + alineador), asi
// siempre se puede reajustar antes de guardar.
export default function CameraCapture({
  viewId,
  guides,
  onCapture,
  onCancel,
  onUseFile,
}: {
  viewId: string;
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
  const [timerSec, setTimerSec] = useState<TimerSec>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const { boxRef, size } = useFrame34();

  // Foto guia (silueta): se elige entre las fotos de esta vista que ya hay en
  // el navegador. Solo se lee; no se copia ni se cambia nada.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [options, setOptions] = useState<GuidePhoto[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [ref, setRef] = useState<{ gp: GuidePhoto; url: string } | null>(null);
  const [refVisible, setRefVisible] = useState(true);
  const [refOpacity, setRefOpacity] = useState(0.4);

  async function openPicker() {
    setPickerOpen(true);
    const list = await listGuidePhotos(viewId);
    setOptions(list);
    const entries = await Promise.all(
      list.map(async (g) => [g.photo.id, await objectUrl(g.photo.thumb_path)] as const),
    );
    setThumbs(Object.fromEntries(entries));
  }

  async function chooseRef(g: GuidePhoto) {
    const url = await objectUrl(g.photo.display_path);
    if (url) {
      setRef({ gp: g, url });
      setRefVisible(true);
    }
    setPickerOpen(false);
  }

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

  async function takePhoto() {
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

  // La captura real va por ref para que la cuenta atras siempre llame a la
  // version actual (facing/estado fresco) sin rehacer el temporizador.
  const takePhotoRef = useRef<() => void>(() => undefined);
  takePhotoRef.current = () => {
    void takePhoto();
  };

  // La cuenta atras vive en un efecto: cada segundo baja un numero y al
  // llegar a 0 dispara la captura. Cancelarla es ponerla a null, lo que
  // limpia el timeout pendiente (tambien al desmontar el componente).
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      takePhotoRef.current();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Si la app pasa a segundo plano con la cuenta atras en marcha, se
  // cancela: una foto disparada con la app oculta seria inesperada.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setCountdown(null);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function cancelCountdown() {
    setCountdown(null);
  }

  function handleCancel() {
    cancelCountdown();
    stopStream();
    onCancel();
  }

  function handleRotate() {
    // Girar la camara cancela cualquier cuenta atras en curso: nada de
    // fotos inesperadas mientras el usuario reencuadra.
    cancelCountdown();
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  function handleShutter() {
    if (countdown !== null) {
      // Pulsar el disparador durante la cuenta atras la cancela.
      cancelCountdown();
      return;
    }
    if (timerSec > 0) setCountdown(timerSec);
    else void takePhoto();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={handleCancel}
          aria-label="Cancelar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
        >
          <IconX className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 px-2 text-center">
          <div className="truncate text-sm font-semibold">Cámara con guías</div>
          <div className="truncate text-[11px] text-zinc-500">Encuadra dentro de las líneas</div>
        </div>
        <button
          onClick={handleRotate}
          aria-label="Cambiar de cámara"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
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
              {ref && refVisible && (
                <GhostPhoto
                  srcUrl={ref.url}
                  opacity={refOpacity}
                  transform={{
                    width: ref.gp.photo.width,
                    height: ref.gp.photo.height,
                    scale: ref.gp.photo.scale,
                    rotation: ref.gp.photo.rotation,
                    offset_x: ref.gp.photo.offset_x,
                    offset_y: ref.gp.photo.offset_y,
                  }}
                />
              )}
              {showGuides && <GuideLayer strokes={guides} />}
              {countdown !== null && (
                <button
                  type="button"
                  onClick={cancelCountdown}
                  aria-label="Cancelar cuenta atrás"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40"
                >
                  <span className="text-7xl font-bold tabular-nums text-white drop-shadow-lg">
                    {countdown}
                  </span>
                  <span className="text-xs font-medium text-zinc-200">Toca para cancelar</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mx-3 mb-3 space-y-3 rounded-2xl bg-zinc-900/80 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGuides((v) => !v)}
            aria-label="Guías"
            className={`flex items-center justify-center gap-1.5 rounded-full min-h-11 px-4 py-2.5 text-xs font-medium ring-1 ring-white/10 transition active:scale-95 ${
              showGuides ? "bg-zinc-700 text-lime-300" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            <IconGuides className="h-3.5 w-3.5" />
            Guías
          </button>
          <div
            role="group"
            aria-label="Temporizador"
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-zinc-800 p-1 ring-1 ring-white/10"
          >
            <IconTimer className="ml-1 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            {TIMER_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={countdown !== null}
                onClick={() => setTimerSec(s)}
                aria-label={s === 0 ? "Sin temporizador" : `Temporizador de ${s} segundos`}
                aria-pressed={timerSec === s}
                className={`min-h-11 min-w-11 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-40 ${
                  timerSec === s ? "bg-zinc-700 text-lime-300" : "text-zinc-500"
                }`}
              >
                {`${s}s`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openPicker()}
            aria-label="Elegir foto guía"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-zinc-800 px-4 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            <IconPhoto className="h-3.5 w-3.5" />
            {ref ? `Foto guía: ${ref.gp.viewName} ${ref.gp.date}` : "Foto guía"}
          </button>
          {ref && (
            <>
              <button
                type="button"
                onClick={() => setRefVisible((v) => !v)}
                aria-pressed={refVisible}
                className={`min-h-11 rounded-full px-3 text-xs font-medium ring-1 ring-white/10 transition active:scale-95 ${
                  refVisible ? "bg-zinc-700 text-lime-300" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {refVisible ? "Ocultar" : "Mostrar"}
              </button>
              <button
                type="button"
                onClick={() => setRef(null)}
                className="min-h-11 rounded-full bg-zinc-800 px-3 text-xs font-medium text-zinc-400 ring-1 ring-white/10 transition active:scale-95"
              >
                Quitar
              </button>
            </>
          )}
        </div>
        {ref && (
          <label className="flex min-h-11 items-center gap-3 text-xs text-zinc-400">
            Opacidad
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={Math.round(refOpacity * 100)}
              onChange={(e) => setRefOpacity(Number(e.target.value) / 100)}
              aria-label="Opacidad de la foto guía"
              className="flex-1 accent-lime-400"
            />
            <span className="w-9 text-right tabular-nums">{Math.round(refOpacity * 100)}%</span>
          </label>
        )}
        <button
          onClick={handleShutter}
          disabled={Boolean(error) || capturing}
          aria-label={countdown !== null ? "Cancelar cuenta atrás" : "Capturar foto"}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition active:scale-95 disabled:opacity-40 ${
            countdown !== null
              ? "bg-zinc-800 text-zinc-100 ring-1 ring-white/15"
              : "bg-lime-400 text-black shadow-lg shadow-lime-400/25"
          }`}
        >
          <IconCamera className="h-5 w-5" />
          {countdown !== null ? `Cancelar (${countdown})` : capturing ? "Capturando…" : "Capturar"}
        </button>
        <p className="text-center text-[11px] text-zinc-500">
          La foto se recorta al marco y luego puedes reajustarla como siempre.
        </p>
      </div>
      {pickerOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/70">
          <div className="max-h-[70%] overflow-y-auto rounded-t-3xl bg-zinc-900 p-4 ring-1 ring-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Elige una foto como guía</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Cerrar selector"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 ring-1 ring-white/10"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
            {options === null ? (
              <p className="py-6 text-center text-sm text-zinc-500">Cargando…</p>
            ) : options.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No hay fotos previas para usar como guía</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {options.map((g) => (
                  <button
                    key={g.photo.id}
                    type="button"
                    onClick={() => void chooseRef(g)}
                    aria-label={`Usar la foto ${g.viewName} del ${g.date} como guía`}
                    className="flex flex-col items-center gap-1 rounded-xl p-1 ring-1 ring-white/10 active:scale-95"
                  >
                    {thumbs[g.photo.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[g.photo.id]!} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="aspect-[3/4] w-full rounded-lg bg-zinc-800" />
                    )}
                    <span className="max-w-full truncate text-[11px] text-zinc-400">{g.viewName}</span>
                    <span className="text-[11px] text-zinc-500">{g.date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
