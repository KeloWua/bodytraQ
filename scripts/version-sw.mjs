// Tras `next build`, incrusta un id de version en out/sw.js para que cada
// despliegue con cambios produzca un service worker distinto y los clientes
// actualicen solos. Id = hash del HTML exportado (determinista: mismo
// contenido -> mismo SW; cualquier cambio de la app -> SW nuevo).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("out/index.html", "utf8");
const id = createHash("sha256").update(html).digest("hex").slice(0, 12);
const swPath = "out/sw.js";
const sw = readFileSync(swPath, "utf8");
if (!sw.includes("__BUILD_ID__")) {
  console.error("version-sw: marcador __BUILD_ID__ no encontrado en out/sw.js");
  process.exit(1);
}
writeFileSync(swPath, sw.replace("__BUILD_ID__", id));
console.log(`version-sw: cache bodytraq-${id}`);
