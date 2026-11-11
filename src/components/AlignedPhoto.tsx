"use client";

import type { Stroke } from "@/lib/db";

export interface PhotoTransform {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  offset_x: number;
  offset_y: number;
}

// Marco 3:4 con pivote en el centro (regla de oro del setup.md, seccion 5):
// - scale = 1: la imagen CUBRE el marco sin deformarse. Si la foto es mas
//   ancha que 3:4 (ratio > 0.75), altura = 100% del marco; si es mas alta,
//   ancho = 100% del marco.
// - La transformacion se aplica a una capa que mide exactamente el 100% del
//   marco, asi offset_x = 0.1 es siempre el 10% del ancho del marco en
//   cualquier pantalla.
function baseCoverStyle(width: number, height: number): React.CSSProperties {
  const ratio = width / height;
  if (ratio > 0.75) {
    // Mas ancha que 3:4: altura completa, el ancho sobresale centrado.
    return { height: "100%", width: "auto", maxWidth: "none" };
  }
  // Mas alta (o igual): ancho completo, la altura sobresale centrada.
  return { width: "100%", height: "auto", maxHeight: "none" };
}

export function GuideLayer({ strokes, color = "#84cc16" }: { strokes: Stroke[]; color?: string }) {
  if (!strokes.length) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {strokes.map((s, i) =>
        s.type === "line" && s.points.length >= 2 ? (
          <line
            key={i}
            x1={s.points[0][0]}
            y1={s.points[0][1]}
            x2={s.points[s.points.length - 1][0]}
            y2={s.points[s.points.length - 1][1]}
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            opacity={0.9}
          />
        ) : s.points.length >= 2 ? (
          <polyline
            key={i}
            points={s.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        ) : null,
      )}
    </svg>
  );
}

export default function AlignedPhoto({
  srcUrl,
  transform,
  guides,
  showGuides = true,
  placeholder,
  badges,
}: {
  srcUrl: string | null;
  transform: PhotoTransform | null;
  guides?: Stroke[];
  showGuides?: boolean;
  placeholder?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <div className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10 shadow-xl shadow-black/40 select-none">
      {srcUrl && transform ? (
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${transform.offset_x * 100}%, ${transform.offset_y * 100}%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={srcUrl}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={baseCoverStyle(transform.width, transform.height)}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">{placeholder}</div>
      )}
      {showGuides && guides && guides.length > 0 && <GuideLayer strokes={guides} />}
      {badges}
    </div>
  );
}
