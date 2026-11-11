import Dexie, { type EntityTable } from "dexie";
import { nowISO, uuid } from "./utils";

export interface Settings {
  id: string; // siempre 'current'
  height_cm: number | null;
  weight_unit: "kg" | "lb";
  default_layout: "single" | "dual";
  show_date: boolean;
  show_weight: boolean;
  show_bmi: boolean;
  active_view_ids: string[];
  keep_original: boolean;
  schema_version: number;
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
  date: string; // YYYY-MM-DD, unico
  weight_kg: number | null;
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

export const SCHEMA_VERSION = 1;

const db = new Dexie("bodytraq") as Dexie & {
  settings: EntityTable<Settings, "id">;
  view_profiles: EntityTable<ViewProfile, "id">;
  check_ins: EntityTable<CheckIn, "id">;
  photos: EntityTable<Photo, "id">;
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

export function defaultSettings(): Settings {
  return {
    id: "current",
    height_cm: null,
    weight_unit: "kg",
    default_layout: "dual",
    show_date: true,
    show_weight: true,
    show_bmi: false,
    active_view_ids: [],
    keep_original: false,
    schema_version: SCHEMA_VERSION,
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
  return (await db.settings.get("current")) ?? defaultSettings();
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
  const all = (await db.check_ins.toArray()).filter((c) => !c.deleted_at);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertCheckIn(
  date: string,
  weightKg: number | null,
  notes: string,
): Promise<CheckIn> {
  const existing = await db.check_ins.get({ date });
  const ts = nowISO();
  if (existing && !existing.deleted_at) {
    await db.check_ins.update(existing.id, {
      weight_kg: weightKg,
      notes,
      updated_at: ts,
    });
    return { ...existing, weight_kg: weightKg, notes, updated_at: ts };
  }
  if (existing && existing.deleted_at) {
    // Reutiliza la fila borrada para no violar el indice unico de fecha.
    await db.check_ins.update(existing.id, {
      weight_kg: weightKg,
      notes,
      updated_at: ts,
      deleted_at: null,
    });
    return { ...existing, weight_kg: weightKg, notes, updated_at: ts, deleted_at: null };
  }
  const row: CheckIn = {
    id: uuid(),
    date,
    weight_kg: weightKg,
    notes,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.check_ins.add(row);
  return row;
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

export default db;
