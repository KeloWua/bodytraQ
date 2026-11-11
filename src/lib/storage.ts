// Almacenamiento de imagenes: OPFS (Origin Private File System) unicamente.
//
// Decision del usuario (setup.md): las imagenes viven en OPFS, el sistema de
// archivos privado del navegador. NO hay fallback a IndexedDB ni a memoria:
// si OPFS no existe en este navegador, las fotos NO se guardan y la app lo
// dice claramente en lugar de aparentar persistencia.

let cachedSupport: boolean | null = null;

export async function opfsSupported(): Promise<boolean> {
  if (cachedSupport !== null) return cachedSupport;
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      cachedSupport = false;
      return false;
    }
    await navigator.storage.getDirectory();
    cachedSupport = true;
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

export async function saveBlob(path: string, blob: Blob): Promise<void> {
  const dir = await rootDir();
  const handle = await dir.getFileHandle(path, { create: true });
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readBlob(path: string): Promise<Blob | null> {
  try {
    const dir = await rootDir();
    const handle = await dir.getFileHandle(path);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteBlob(path: string): Promise<void> {
  try {
    const dir = await rootDir();
    await dir.removeEntry(path);
  } catch {
    // No existe: nada que borrar.
  }
}

export async function listPaths(): Promise<string[]> {
  const out: string[] = [];
  // TS no tipa aun las iteraciones del File System Access API.
  const dir = (await rootDir()) as FileSystemDirectoryHandle & {
    keys(): AsyncIterableIterator<string>;
  };
  for await (const key of dir.keys()) out.push(key);
  return out;
}

export interface Quota {
  usage: number;
  quota: number;
}

export async function storageEstimate(): Promise<Quota | null> {
  try {
    const e = await navigator.storage.estimate();
    if (e.usage === undefined || e.quota === undefined) return null;
    return { usage: e.usage, quota: e.quota };
  } catch {
    return null;
  }
}

// Cache de object URLs por path para no releer OPFS en cada render.
const urlCache = new Map<string, string>();

export async function objectUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit) return hit;
  const raw = await readBlob(path);
  if (!raw) return null;
  // Descifrado transparente cuando la proteccion esta activa (importacion
  // diferida para no crear ciclo de modulos en frio).
  const { unsealBlob } = await import("./crypto");
  const blob = await unsealBlob(raw);
  if (!blob) return null; // cifrado y sin sesion: la UI muestra la pantalla de bloqueo
  const url = URL.createObjectURL(blob);
  urlCache.set(path, url);
  return url;
}

// Al bloquear o recifrar: suelta las URLs en memoria de fotos descifradas.
export function clearUrlCache(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export function revokeUrl(path: string): void {
  const hit = urlCache.get(path);
  if (hit) {
    URL.revokeObjectURL(hit);
    urlCache.delete(path);
  }
}

// Recuperacion de arranque: borra archivos de OPFS que ninguna fila de fotos
// referencia (restos de un guardado interrumpido a mitad). El guardado escribe
// primero los archivos y despues la fila en Dexie; si algo falla entre medias,
// el archivo quedaria huerfano y esta pasada lo limpia. No es una transaccion
// atomica: es escritura ordenada + limpieza de huerfanos.
export async function sweepOrphans(referencedPaths: Set<string>): Promise<number> {
  let removed = 0;
  try {
    const paths = await listPaths();
    for (const p of paths) {
      if (!referencedPaths.has(p)) {
        await deleteBlob(p);
        removed += 1;
      }
    }
  } catch {
    // Si el listado falla, no borramos nada por precaucion.
    return 0;
  }
  return removed;
}
