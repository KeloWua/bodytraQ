import db, { photoOf, type Photo, type PhotoInput } from "./db";
import { saveBlob, deleteBlob, revokeUrl } from "./storage";
import { nowISO, uuid } from "./utils";

// Guarda una foto para (check-in, vista). Si ya existia una activa, la
// sustituye: la anterior pasa a borrado logico y sus archivos se eliminan.
//
// Orden de escritura: primero archivos en OPFS, despues la fila en Dexie.
// Si la escritura de la fila falla, se borran los archivos recien escritos.
// No es atomico: un corte entre ambos pasos deja archivos huerfanos que
// limpia sweepOrphans() en el siguiente arranque.
export async function savePhoto(
  checkInId: string,
  viewId: string,
  input: PhotoInput,
): Promise<Photo> {
  const id = uuid();
  const display_path = `${id}.jpg`;
  const thumb_path = `${id}_thumb.jpg`;
  const original_path = input.original ? `${id}_original` : null;

  const { sealBlob } = await import("./crypto");
  await saveBlob(display_path, await sealBlob(input.display));
  await saveBlob(thumb_path, await sealBlob(input.thumb));
  if (input.original && original_path) {
    await saveBlob(original_path, await sealBlob(input.original));
  }

  const ts = nowISO();
  const row: Photo = {
    id,
    check_in_id: checkInId,
    view_profile_id: viewId,
    display_path,
    thumb_path,
    original_path,
    width: input.width,
    height: input.height,
    scale: input.scale,
    rotation: input.rotation,
    offset_x: input.offset_x,
    offset_y: input.offset_y,
    upload_status: "local_only",
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };

  try {
    await db.transaction("rw", db.photos, async () => {
      const prev = await photoOf(checkInId, viewId);
      if (prev) {
        await db.photos.update(prev.id, { deleted_at: ts, updated_at: ts });
      }
      await db.photos.add(row);
    });
  } catch (e) {
    await deleteBlob(display_path);
    await deleteBlob(thumb_path);
    if (original_path) await deleteBlob(original_path);
    throw e;
  }

  // Borrado diferido de los archivos de la foto sustituida.
  const prev = await db.photos
    .where("[check_in_id+view_profile_id]")
    .equals([checkInId, viewId])
    .filter((p) => !!p.deleted_at && p.id !== id)
    .toArray();
  for (const p of prev) {
    await deleteBlob(p.display_path);
    await deleteBlob(p.thumb_path);
    if (p.original_path) await deleteBlob(p.original_path);
    revokeUrl(p.display_path);
    revokeUrl(p.thumb_path);
  }

  return row;
}

export async function deletePhoto(photo: Photo): Promise<void> {
  const ts = nowISO();
  await db.photos.update(photo.id, { deleted_at: ts, updated_at: ts });
  await deleteBlob(photo.display_path);
  await deleteBlob(photo.thumb_path);
  if (photo.original_path) await deleteBlob(photo.original_path);
  revokeUrl(photo.display_path);
  revokeUrl(photo.thumb_path);
}

// Actualiza solo la transformacion de una foto existente (reedicion de
// alineacion): no toca archivos OPFS, guias ni la foto en si.
export async function updatePhotoTransform(
  id: string,
  t: { scale: number; rotation: number; offset_x: number; offset_y: number },
): Promise<void> {
  await db.photos.update(id, { ...t, updated_at: nowISO() });
}
