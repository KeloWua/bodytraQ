// Fotos que se pueden usar como guia (silueta) en la camara. Solo lectura de
// las fotos que ya estan en este navegador: no copia, no sube y no cambia
// nada del almacenamiento.
import db, { type Photo } from "./db";

export interface GuidePhoto {
  photo: Photo;
  date: string; // fecha del registro, YYYY-MM-DD
  viewName: string; // nombre de la vista de la foto, para identificarla
  sameView: boolean; // true si es de la vista que se va a fotografiar
}

// Todas las fotos activas de cualquier vista. Primero las de la vista actual
// y luego las demas, cada grupo de la mas reciente a la mas antigua.
export async function listGuidePhotos(viewId: string): Promise<GuidePhoto[]> {
  const photos = (await db.photos.toArray()).filter((p) => !p.deleted_at);
  const views = new Map((await db.view_profiles.toArray()).map((v) => [v.id, v]));
  const out: GuidePhoto[] = [];
  for (const photo of photos) {
    const ci = await db.check_ins.get(photo.check_in_id);
    const view = views.get(photo.view_profile_id);
    if (!ci || ci.deleted_at || !view || view.deleted_at) continue;
    out.push({ photo, date: ci.date, viewName: view.name, sameView: photo.view_profile_id === viewId });
  }
  out.sort((a, b) => {
    if (a.sameView !== b.sameView) return a.sameView ? -1 : 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
  return out;
}
