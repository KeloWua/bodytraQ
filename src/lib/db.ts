import Dexie, { type EntityTable } from "dexie";
import { nowISO, todayISO, uuid } from "./utils";

export interface Settings {
  id: string; // siempre 'current'
  height_cm: number | null;
  weight_unit: "kg" | "lb";
  // Fotos simultaneas en el timeline (1 a 4). Sustituye al antiguo
  // default_layout "single"|"dual"; getSettings migra el valor viejo.
  photos_per_view: number;
  show_date: boolean;
  show_weight: boolean;
  show_bmi: boolean;
  active_view_ids: string[];
  keep_original: boolean;
  schema_version: number;
  theme: "dark" | "light";
  date_nav?: "arrows" | "slider";
}

export interface ViewProfile {
  id: string;
  name: string;
  order: number;
  guides: string; // JSON serializado de Stroke[]
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CheckIn {
  id: string;
  date: string; // YYYY-MM-DD, sin unicidad (active_key la proporciona)
  active_key: string; // para activos = date; para papelera = `${date}#deleted#${id}`
  weight_kg: number | null;
  waist_cm: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Photo {
  id: string;
  check_in_id: string;
  view_profile_id: string;
  display_path: string;
  thumb_path: string;
  original_path: string | null;
  width: number;
  height: number;
  scale: number; // 1.0 = base cover
  rotation: number; // grados, -180 a 180
  offset_x: number; // fraccion -0.5 a 0.5 respecto al centro del marco
  offset_y: number;
  upload_status: "local_only" | "pending" | "synced";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Stroke {
  type: "line" | "path";
  points: [number, number][]; // coordenadas normalizadas 0.0 a 1.0
}

// Cola de borrado de archivos OPFS pendiente (drenada al arrancar).
export interface PendingFileDeletion {
  id: string;
  paths: string[];
  enqueued_at: string;
}

export const SCHEMA_VERSION = 2;

// Tabla meta: pares clave/valor internos de la app (p. ej. la sal y el
// verificador de la proteccion con contrasena). No contiene datos del usuario.
export interface MetaRow {
  id: string;
  [key: string]: unknown;
}

const db = new Dexie("bodytraq") as Dexie & {
  settings: EntityTable<Settings, "id">;
  view_profiles: EntityTable<ViewProfile, "id">;
  check_ins: EntityTable<CheckIn, "id">;
  photos: EntityTable<Photo, "id">;
  meta: EntityTable<MetaRow, "id">;
  pendingFileDeletions: EntityTable<PendingFileDeletion, "id">;
};

db.version(1).stores({
  settings: "id",
  view_profiles: "id, order, deleted_at",
  check_ins: "id, &date, deleted_at",
  // Indice compuesto NO unico: la unicidad (una foto por vista y dia) se
  // aplica en logica (savePhoto), para que el borrado logico no bloquee
  // volver a subir una foto a la misma vista y dia.
  photos: "id, check_in_id, view_profile_id, [check_in_id+view_profile_id], deleted_at",
});

// v2: solo anade la tabla meta; los datos existentes no cambian.
db.version(2).stores({
  meta: "id",
});

// v3: papelera con active_key unico para registros activos, tabla outbox para
// borrado diferido de archivos OPFS. date ya no es unico ni clave primaria.
db.version(3).stores({
  settings: "id",
  view_profiles: "id, order, deleted_at",
  check_ins: "id, date, &active_key, deleted_at",
  photos: "id, check_in_id, view_profile_id, [check_in_id+view_profile_id], deleted_at",
  meta: "id",
  pendingFileDeletions: "id, enqueued_at",
}).upgrade(async (tx) => {
  // Migrar check_ins: calcular active_key a partir de date y deleted_at.
  const rows = await tx.table<CheckIn>("check_ins").toArray();
  if (rows.length === 0) return;
  for (const row of rows) {
    if (row.deleted_at) {
      row.active_key = `${row.date}#deleted#${row.id}`;
    } else {
      row.active_key = row.date;
    }
  }
  await tx.table<CheckIn>("check_ins").bulkPut(rows);
});

export function defaultSettings(): Settings {
  return {
    id: "current",
    height_cm: null,
    weight_unit: "kg",
    photos_per_view: 2,
    show_date: true,
    show_weight: true,
    show_bmi: false,
    active_view_ids: [],
    keep_original: false,
    schema_version: SCHEMA_VERSION,
    theme: "dark",
    date_nav: "arrows",
  };
}

// Crea los ajustes por defecto y los perfiles iniciales "Frontal" y "Espalda".
export async function ensureSeed(): Promise<void> {
  await db.transaction("rw", db.settings, db.view_profiles, async () => {
    let s = await db.settings.get("current");
    if (!s) {
      s = defaultSettings();
      await db.settings.add(s);
    }
    const views = (await db.view_profiles.toArray()).filter((v) => !v.deleted_at);
    if (views.length === 0) {
      const ts = nowISO();
      const frontal: ViewProfile = {
        id: uuid(),
        name: "Frontal",
        order: 0,
        guides: "[]",
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      const espalda: ViewProfile = {
        id: uuid(),
        name: "Espalda",
        order: 1,
        guides: "[]",
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      await db.view_profiles.bulkAdd([frontal, espalda]);
      if (s.active_view_ids.length === 0) {
        await db.settings.update("current", {
          active_view_ids: [frontal.id, espalda.id],
        });
      }
    }
  });
}

export async function getSettings(): Promise<Settings> {
  const s = (await db.settings.get("current")) ?? defaultSettings();
  // Migracion perezosa: las instalaciones anteriores guardaban
  // default_layout "single"|"dual" y ningun photos_per_view. Tambien
  // cubre backups antiguos restaurados, que llegan con el campo viejo.
  const legacy = (s as { default_layout?: unknown }).default_layout;
  let ppv = s.photos_per_view;
  if (typeof ppv !== "number" || !Number.isFinite(ppv)) {
    ppv = legacy === "single" ? 1 : 2;
  }
  ppv = Math.min(4, Math.max(1, Math.round(ppv)));
  // Migracion perezosa de theme: si no existe o no es valido, usar "dark".
  const theme = (s.theme === "light" ? "light" : "dark") as "dark" | "light";
  // Migracion perezosa de date_nav: si falta o no es valido, usar "arrows".
  const rawDateNav = s.date_nav;
  const dateNav = (rawDateNav === "slider" ? "slider" : "arrows") as "arrows" | "slider";
  return { ...s, photos_per_view: ppv, theme, date_nav: dateNav };
}

export async function activeViews(): Promise<ViewProfile[]> {
  const s = await getSettings();
  const all = (await db.view_profiles.toArray()).filter((v) => !v.deleted_at);
  const byId = new Map(all.map((v) => [v.id, v]));
  const actives = s.active_view_ids
    .map((id) => byId.get(id))
    .filter((v): v is ViewProfile => !!v);
  // Si el ajuste esta vacio o apunta a vistas borradas, usar todas por orden.
  return actives.length > 0 ? actives : all.sort((a, b) => a.order - b.order);
}

export async function listCheckIns(): Promise<CheckIn[]> {
  // Solo registros activos (sin deleted_at). Con active_key, no hay riesgo
  // de colision: cada activo tiene active_key = date, unico por indice.
  const all = (await db.check_ins.toArray()).filter((c) => !c.deleted_at);
  const { unsealText } = await import("./crypto");
  const out: CheckIn[] = [];
  for (const c of all) out.push({ ...c, notes: await unsealText(c.notes) });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Creacion y edicion explicitas: nunca convertir un alta en una actualizacion.
export async function upsertCheckIn(
  date: string,
  weightKg: number | null,
  notesPlain: string,
  editingId?: string,
  waistCm: number | null = null,
): Promise<CheckIn> {
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}` !== date) {
    throw new Error("Elige una fecha válida.");
  }
  if (!editingId && date > todayISO()) throw new Error("No puedes crear registros en el futuro.");
  const { sealText } = await import("./crypto");
  const notes = await sealText(notesPlain);
  const ts = nowISO();
  return db.transaction("rw", db.check_ins, db.photos, async () => {
    if (editingId) {
      const row = await db.check_ins.get(editingId);
      if (!row || row.deleted_at) throw new Error("Este registro ya no está disponible. Cierra y vuelve a abrirlo.");
      if (row.date !== date) throw new Error("La fecha no se cambia al editar. Crea otro registro para otro día.");
      await db.check_ins.update(row.id, { weight_kg: weightKg, waist_cm: waistCm, notes, updated_at: ts });
      return { ...row, weight_kg: weightKg, waist_cm: waistCm, notes: notesPlain, updated_at: ts };
    }
    const existing = await db.check_ins.get({ active_key: date });
    if (existing) {
      const photo = await db.photos.where("check_in_id").equals(existing.id).filter((p) => !p.deleted_at).first();
      throw new Error(photo
        ? "Ya tienes fotos de ese día. Abre ese registro para editarlo o añadir otra vista. No se ha cambiado nada."
        : "Ya tienes un registro de ese día. Ábrelo para editarlo o añadir fotos. No se ha cambiado nada.");
    }
    const row: CheckIn = {
      id: uuid(), date, active_key: date, weight_kg: weightKg, waist_cm: waistCm, notes,
      created_at: ts, updated_at: ts, deleted_at: null,
    };
    // La transaccion serializa altas simultaneas; el indice unico es otra
    // barrera. Nunca actualizar la fila ganadora de otra pestana.
    await db.check_ins.add(row);
    return { ...row, notes: notesPlain };
  });
}

export async function photosOf(checkInId: string): Promise<Photo[]> {
  return db.photos
    .where("check_in_id")
    .equals(checkInId)
    .filter((p) => !p.deleted_at)
    .toArray();
}

export interface PhotoInput {
  display: Blob;
  thumb: Blob;
  original?: Blob | null;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  offset_x: number;
  offset_y: number;
}

export async function photoOf(checkInId: string, viewId: string): Promise<Photo | undefined> {
  return db.photos
    .where("[check_in_id+view_profile_id]")
    .equals([checkInId, viewId])
    .filter((p) => !p.deleted_at)
    .first();
}

// --- Papelera ----------------------------------------------------------------

// Devuelve las rutas de archivos OPFS de todas las fotos de un registro.
export function photosOfCheckInPaths(photos: Photo[]): string[] {
  const paths: string[] = [];
  for (const p of photos) {
    paths.push(p.display_path, p.thumb_path);
    if (p.original_path) paths.push(p.original_path);
  }
  return paths;
}

// Lista los registros en papelera (con deleted_at), ordenados por fecha de
// borrado descendente (los mas recientes primero).
export async function listTrashed(): Promise<CheckIn[]> {
  const all = (await db.check_ins.toArray()).filter((c) => !!c.deleted_at);
  const { unsealText } = await import("./crypto");
  const out: CheckIn[] = [];
  for (const c of all) out.push({ ...c, notes: await unsealText(c.notes) });
  return out.sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
}

// Mueve un registro activo a la papelera: marca deleted_at, cambia active_key
// para liberar la fecha, y marca las fotos asociadas como borradas.
export async function moveToTrash(checkInId: string): Promise<void> {
  const ts = nowISO();
  await db.transaction("rw", db.check_ins, db.photos, async () => {
    const row = await db.check_ins.get(checkInId);
    if (!row || row.deleted_at) return;
    // Cambia active_key para liberar la fecha (unico para activos).
    const trashedKey = `${row.date}#deleted#${row.id}`;
    await db.check_ins.update(row.id, {
      active_key: trashedKey,
      deleted_at: ts,
      updated_at: ts,
    });
    // Marca fotos como borradas logicamente (los archivos se borran despues).
    const photos = await db.photos
      .where("check_in_id")
      .equals(checkInId)
      .filter((p) => !p.deleted_at)
      .toArray();
    for (const p of photos) {
      await db.photos.update(p.id, { deleted_at: ts, updated_at: ts });
    }
  });
}

// Restaura un registro de la papelera. Si ya existe un activo con esa fecha,
// devuelve { conflict: true } para que la UI decida que hacer.
export async function restoreCheckIn(checkInId: string): Promise<{ ok: boolean; conflict?: boolean }> {
  const row = await db.check_ins.get(checkInId);
  if (!row || !row.deleted_at) return { ok: false };

  // Verifica si ya hay un activo con esta fecha.
  const existing = await db.check_ins.get({ active_key: row.date });
  if (existing) return { ok: false, conflict: true };

  const ts = nowISO();
  await db.transaction("rw", db.check_ins, db.photos, async () => {
    // Restaura active_key a la fecha original.
    await db.check_ins.update(row.id, {
      active_key: row.date,
      deleted_at: null,
      updated_at: ts,
    });
    // Restaura fotos asociadas.
    const photos = await db.photos
      .where("check_in_id")
      .equals(checkInId)
      .filter((p) => !!p.deleted_at)
      .toArray();
    for (const p of photos) {
      await db.photos.update(p.id, { deleted_at: null, updated_at: ts });
    }
  });

  return { ok: true };
}

// Elimina definitivamente un registro de la papelera: borra filas y encola
// rutas de fotos en outbox para borrado OPFS diferido.
export async function deleteForever(checkInId: string): Promise<void> {
  await db.transaction("rw", db.check_ins, db.photos, db.pendingFileDeletions, async () => {
    const row = await db.check_ins.get(checkInId);
    if (!row) return;

    // Recoge las rutas de fotos antes de borrar las filas.
    const photos = await db.photos
      .where("check_in_id")
      .equals(checkInId)
      .toArray();
    const paths = photosOfCheckInPaths(photos);

    // Borra fotos y registro.
    await db.photos.where("check_in_id").equals(checkInId).delete();
    await db.check_ins.delete(checkInId);

    // Encola rutas para borrado OPFS diferido.
    if (paths.length > 0) {
      await db.pendingFileDeletions.add({
        id: uuid(),
        paths,
        enqueued_at: nowISO(),
      });
    }
  });
}

// Purga automatica: elimina los registros en papelera con mas de 30 dias.
// Fase 1: transaccion Dexie (marca, encola, borra).
// Fase 2: borrado OPFS idempotente.
// Fase 3: limpieza de cola.
// Solo usa metadatos no cifrados (deleted_at, fechas): no desencripta nada.
export async function purgeExpired(): Promise<number> {
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Identifica los expirados (deleted_at > 30 dias).
  const all = (await db.check_ins.toArray()).filter((c) => !!c.deleted_at);
  const expired: CheckIn[] = [];
  for (const c of all) {
    const deletedDate = new Date(c.deleted_at!).getTime();
    if (now - deletedDate >= thirtyDaysMs) {
      expired.push(c);
    }
  }

  if (expired.length === 0) return 0;

  // Fase 1: transaccion Dexie — borra filas y encola rutas OPFS.
  await db.transaction("rw", db.check_ins, db.photos, db.pendingFileDeletions, async () => {
    for (const row of expired) {
      const photos = await db.photos
        .where("check_in_id")
        .equals(row.id)
        .toArray();
      const paths = photosOfCheckInPaths(photos);
      await db.photos.where("check_in_id").equals(row.id).delete();
      await db.check_ins.delete(row.id);
      if (paths.length > 0) {
        await db.pendingFileDeletions.add({
          id: uuid(),
          paths,
          enqueued_at: nowISO(),
        });
      }
    }
  });

  // Fase 2 y 3: drenar outbox (incluye los nuevos items de esta purga).
  await drainOutbox();

  return expired.length;
}

// Drena la cola de borrado de archivos OPFS pendiente. Se ejecuta al arrancar
// SIEMPRE antes de purgar nuevos, para completar cualquier purga interrumpida.
export async function drainOutbox(): Promise<void> {
  const { deleteBlob, revokeUrl } = await import("./storage");

  while (true) {
    const pending = await db.pendingFileDeletions.toArray();
    if (pending.length === 0) break;

    const ids: string[] = [];
    for (const item of pending) {
      for (const path of item.paths) {
        try {
          await deleteBlob(path);
          revokeUrl(path);
        } catch {
          // NotFound = exito: el archivo ya no existe.
        }
      }
      ids.push(item.id);
    }
    await db.pendingFileDeletions.bulkDelete(ids);
  }
}

export default db;
