"use client";

import { useEffect, useRef, useState } from "react";

// Mide el espacio disponible y calcula el mayor marco 3:4 que cabe dentro.
// La vista previa de los editores coincide asi con el marco real del timeline
// (el aspect-ratio CSS con h-full + max-w-full no garantiza la proporcion).
export function useFrame34() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const cs = getComputedStyle(el);
      const cw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ch = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.max(0, Math.min(cw, (ch * 3) / 4));
      setSize({ w, h: (w * 4) / 3 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { boxRef, size };
}
