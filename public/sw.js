// Service worker PWA: offline tras la primera visita Y actualizacion segura.
// La cache lleva el id del build (lo escribe scripts/version-sw.mjs en cada
// npm run build), asi cada despliegue cambia este archivo y el navegador
// instala la version nueva sin intervencion. NUNCA toca IndexedDB ni OPFS:
// los datos del usuario (registros, fotos) viven fuera del Cache Storage.
const CACHE = "bodytraq-__BUILD_ID__";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Navegaciones/HTML: red primero (para que las novedades lleguen aunque la
  // esquina del SW este en transito), cache solo como respaldo offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  // Estaticos (_next con hash, iconos, manifest): cache-first, red de relleno.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
