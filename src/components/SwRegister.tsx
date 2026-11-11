"use client";

import { useEffect } from "react";

// Registro del SW con actualizacion automatica: al llegar una version nueva
// (skipWaiting + claim), controllerchange dispara UNA recarga y la app nueva
// toma el control. Los datos (IndexedDB/OPFS) no pasan por el SW: no se tocan.
export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
  }, []);
  return null;
}
