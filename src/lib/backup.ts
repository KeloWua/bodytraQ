import JSZip from "jszip";
import db, {
  SCHEMA_VERSION,
  type Settings,
  type ViewProfile,
  type CheckIn,
  type Photo,
  type MetaRow,
} from "./db";
import { saveBlob, readBlob, listPaths, deleteBlob, revokeUrl } from "./storage";

export interface BackupData {
  schema_version: number;
  exported_at: string;
  settings: Settings[];
  view_profiles: ViewProfile[];
  check_ins: CheckIn[];
  photos: Photo[];
  // Si la proteccion estaba activa al exportar, la copia va cifrada y lleva
  // sal + clave de datos envuelta: al importarla se abre con su contrasena.
  meta?: MetaRow[];
}

const JSON_NAME = "bodytraq-backup.json";
const FILES_DIR = "files/";

function photoPaths(p: Photo): string[] {
  const out = [p.display_path, p.thumb_path];
  if (p.original_path) out.push(p.original_path);
  return out;
}

export async function exportBackup(): Promise<Blob> {
  const data: BackupData = {
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    settings: await db.settings.toArray(),
    view_profiles: await db.view_profiles.toArray(),
    check_ins: await db.check_ins.toArray(),
    photos: await db.photos.toArray(),
    meta: await db.meta.toArray(),
  };
  const zip = new JSZip();
  zip.file(JSON_NAME, JSON.stringify(data, null, 2));
  const seen = new Set<string>();
  for (const p of data.photos) {
    for (const path of photoPaths(p)) {
      if (seen.has(path)) continue;
      seen.add(path);
      const blob = await readBlob(path);
      if (blob) zip.file(FILES_DIR + path, blob);
    }
  }
  return zip.generateAsync({ type: "blob" });
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  // 'confirm-downgrade': la copia no esta protegida pero el perfil actual si:
  // importarla desactivaria la proteccion. Requiere confirmacion explicita.
  code?: "confirm-downgrade";
  photos?: number;
  checkIns?: number;
}

// Importa una copia ZIP: valida todo ANTES de tocar los datos actuales,
// escribe los archivos nuevos y solo entonces sustituye las tablas. Si algo
// no cuadra, no cambia nada.
export async function importBackup(
  file: File,
  opts?: { confirmedDowngrade?: boolean }
): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, error: "El archivo no es un ZIP valido." };
  }

  const jsonEntry = zip.file(JSON_NAME);
  if (!jsonEntry) return { ok: false, error: `Falta ${JSON_NAME} en el ZIP.` };

  let data: BackupData;
  try {
    data = JSON.parse(await jsonEntry.async("string"));
  } catch {
    return { ok: false, error: "El JSON de la copia no se puede leer." };
  }

  if (data.schema_version !== SCHEMA_VERSION) {
    return { ok: false, error: `Version de copia no soportada (${data.schema_version}).` };
  }
  for (const key of ["settings", "view_profiles", "check_ins", "photos"] as const) {
    if (!Array.isArray(data[key])) {
      return { ok: false, error: `La copia no tiene la seccion ${key}.` };
    }
  }

  // Aviso ANTES de tocar nada: si este perfil tiene proteccion activa y la
  // copia no la lleva, importarla desactivaria el cifrado silenciosamente.
  const zipProtected =
    Array.isArray(data.meta) && data.meta.some((r) => r.id === "protection");
  const localProtected = (await db.meta.get("protection")) !== undefined;
  if (localProtected && !zipProtected && !opts?.confirmedDowngrade) {
    return { ok: false, code: "confirm-downgrade" };
  }

  // Toda ruta referenciada debe existir en el ZIP.
  const wanted = new Set<string>();
  for (const p of data.photos) for (const path of photoPaths(p)) wanted.add(path);
  for (const path of wanted) {
    if (!zip.file(FILES_DIR + path)) {
      return { ok: false, error: `Falta un archivo de foto en la copia: ${path}` };
    }
  }

  // Fase 1: escribir archivos (sin tocar la base de datos todavia).
  const written: string[] = [];
  try {
    for (const path of wanted) {
      const entry = zip.file(FILES_DIR + path);
      if (!entry) continue;
      const blob = await entry.async("blob");
      await saveBlob(path, blob);
      written.push(path);
    }
  } catch {
    for (const path of written) await deleteBlob(path);
    return { ok: false, error: "No se pudieron escribir las fotos en el dispositivo." };
  }

  // Fase 2: sustituir las tablas dentro de una transaccion.
  try {
    await db.transaction("rw", db.settings, db.view_profiles, db.check_ins, db.photos, db.meta, async () => {
      await db.settings.clear();
      await db.view_profiles.clear();
      await db.check_ins.clear();
      await db.photos.clear();
      await db.meta.clear();
      await db.settings.bulkAdd(data.settings);
      await db.view_profiles.bulkAdd(data.view_profiles);
      await db.check_ins.bulkAdd(data.check_ins);
      await db.photos.bulkAdd(data.photos);
      if (Array.isArray(data.meta)) await db.meta.bulkAdd(data.meta);
    });
  } catch {
    return { ok: false, error: "No se pudo registrar la copia en la base de datos local." };
  }

  // Limpieza: archivos que habia antes y ya no referencia nadie.
  const stillWanted = new Set(wanted);
  for (const path of await listPaths()) {
    if (!stillWanted.has(path)) {
      await deleteBlob(path);
      revokeUrl(path);
    }
  }

  return { ok: true, photos: data.photos.filter((p) => !p.deleted_at).length, checkIns: data.check_ins.filter((c) => !c.deleted_at).length };
}
