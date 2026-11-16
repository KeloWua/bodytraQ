"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import db, {
  activeViews,
  defaultSettings,
  deleteForever,
  drainOutbox,
  ensureSeed,
  getSettings,
  listCheckIns,
  listTrashed,
  moveToTrash,
  photosOf,
  purgeExpired,
  restoreCheckIn,
  upsertCheckIn,
  type CheckIn,
  type Photo,
  type Settings,
  type Stroke,
  type ViewProfile,
} from "@/lib/db";
import { opfsSupported, storageEstimate, sweepOrphans, objectUrl, type Quota } from "@/lib/storage";
import { processImageFile } from "@/lib/images";
import { savePhoto, updatePhotoTransform } from "@/lib/photos";
import { nowISO, uuid } from "@/lib/utils";
import Timeline from "@/components/Timeline";
import CheckInForm from "@/components/CheckInForm";
import SettingsSheet from "@/components/SettingsSheet";
import TrashView from "@/components/TrashView";
import LockScreen from "@/components/LockScreen";
import { hasSession, lock, protectionEnabled } from "@/lib/crypto";
import PhotoAligner from "@/components/PhotoAligner";
import GuideEditor from "@/components/GuideEditor";
import CameraCapture from "@/components/CameraCapture";
import { IconCamera, IconPhoto } from "@/components/icons";

type Modal =
  | { kind: "none" }
  | { kind: "checkin"; editing?: CheckIn }
  | { kind: "settings" }
  | { kind: "trash" }
  | { kind: "addchoice"; viewId: string }
  | { kind: "camera"; checkInId: string; viewId: string }
  | { kind: "align"; checkInId: string; viewId: string; file: File }
  | { kind: "realign"; photo: Photo }
  | { kind: "guides"; view: ViewProfile };

// Toast de deshacer tras mover a papelera.
interface UndoToast {
  checkInId: string;
  toastId: number; // identificador unico para comparar en setTimeout
}

export default function Page() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [protection, setProtection] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [views, setViews] = useState<ViewProfile[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [index, setIndex] = useState(0);
  const [modal, setModal] = useState<Modal>({ kind: "none" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [realign, setRealign] = useState<{ previewUrl: string } | null>(null);
  const [alignData, setAlignData] = useState<{
    previewUrl: string;
    display: Blob;
    thumb: Blob;
    width: number;
    height: number;
    original: Blob | null;
  } | null>(null);
  const [guideBackdrop, setGuideBackdrop] = useState<{ url: string | null; t: Photo | null }>({
    url: null,
    t: null,
  });
  // Papelera
  const [trashed, setTrashed] = useState<CheckIn[]>([]);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const toastCounter = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingView = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const [s, v, c] = await Promise.all([getSettings(), activeViews(), listCheckIns()]);
    setSettings(s);
    setViews(v);
    setCheckIns(c);
    setIndex((i) => Math.min(Math.max(0, i), Math.max(0, c.length - 1)));
    setRefreshKey((k) => k + 1);
  }, []);

  // Arranque: seed, deteccion OPFS, drenaje de outbox, purga de papelera,
  // limpieza de archivos huerfanos. Si la proteccion esta activa y no hay
  // sesion, la pantalla de bloqueo va primero y los datos (notas cifradas
  // incluidas) solo se cargan tras desbloquear. La purga usa solo metadatos
  // no cifrados (deleted_at y fechas): no desencripta nada.
  useEffect(() => {
    (async () => {
      await ensureSeed();
      // Drenar outbox SIEMPRE antes de purgar nuevos: completa cualquier
      // purga interrumpida sin pedir contraseña.
      await drainOutbox();
      // Purga automatica de papelera a los 30 dias. Funciona con app bloqueada
      // porque solo lee deleted_at (no cifrado) y borra filas.
      await purgeExpired();
      const ok = await opfsSupported();
      setStorageOk(ok);
      if (ok) {
        const photos = await db.photos.toArray();
        const referenced = new Set<string>();
        for (const p of photos) {
          referenced.add(p.display_path);
          referenced.add(p.thumb_path);
          if (p.original_path) referenced.add(p.original_path);
        }
        await sweepOrphans(referenced);
        setQuota(await storageEstimate());
      }
      const prot = await protectionEnabled();
      setProtection(prot);
      if (prot && !hasSession()) {
        setLocked(true);
        setReady(true);
        return;
      }
      const [c, t] = await Promise.all([listCheckIns(), listTrashed()]);
      setSettings(await getSettings());
      setViews(await activeViews());
      setCheckIns(c);
      setTrashed(t);
      setIndex(Math.max(0, c.length - 1));
      setReady(true);
    })();
  }, []);

  // Autobloqueo: si la app pasa mas de 5 minutos en segundo plano, al volver
  // pide la contrasena de nuevo.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      void (async () => {
        if (
          hiddenAt !== null &&
          Date.now() - hiddenAt > 5 * 60 * 1000 &&
          (await protectionEnabled()) &&
          hasSession()
        ) {
          lock();
          setLocked(true);
        }
        hiddenAt = null;
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function handleUnlocked() {
    setLocked(false);
    setProtection(true);
    const [c, t] = await Promise.all([listCheckIns(), listTrashed()]);
    setSettings(await getSettings());
    setViews(await activeViews());
    setCheckIns(c);
    setTrashed(t);
    setIndex(Math.max(0, c.length - 1));
    setRefreshKey((k) => k + 1);
  }

  // --- Papelera ---------------------------------------------------------------

  async function handleMoveToTrash(checkInId: string) {
    await moveToTrash(checkInId);
    const id = ++toastCounter.current;
    setUndoToast({ checkInId, toastId: id });
    // Ocultar toast tras 5 segundos, solo si sigue siendo el mismo toast.
    setTimeout(() => {
      setUndoToast((prev) => (prev && prev.toastId === id ? null : prev));
    }, 5000);
    await reload();
    const t = await listTrashed();
    setTrashed(t);
  }

  async function handleUndoTrash(checkInId: string) {
    setUndoToast(null);
    const result = await restoreCheckIn(checkInId);
    if (result.ok) {
      await reload();
      const t = await listTrashed();
      setTrashed(t);
    }
  }

  async function handleRestoreFromTrash(checkInId: string) {
    const result = await restoreCheckIn(checkInId);
    if (result.conflict) {
      // Ya existe un activo con esa fecha: preguntar si se quiere sustituir.
      const confirmReplace = window.confirm(
        "Ya existe un registro activo para esa fecha. ¿Mover el actual a la papelera y restaurar este?"
      );
      if (!confirmReplace) return;
      // Encuentra el activo que ocupa la fecha directamente de la DB.
      const trashedItem = trashed.find((t) => t.id === checkInId);
      if (!trashedItem) return;
      const activeWithSameDate = await db.check_ins.get({ active_key: trashedItem.date });
      if (activeWithSameDate) {
        await moveToTrash(activeWithSameDate.id);
      }
      // Ahora restaura el de la papelera.
      const result2 = await restoreCheckIn(checkInId);
      if (result2.ok) {
        await reload();
        const t = await listTrashed();
        setTrashed(t);
      }
    } else if (result.ok) {
      await reload();
      const t = await listTrashed();
      setTrashed(t);
    }
  }

  async function handleDeleteForever(checkInId: string) {
    await deleteForever(checkInId);
    // Drenar outbox inmediatamente para borrar archivos OPFS.
    await drainOutbox();
    const t = await listTrashed();
    setTrashed(t);
    await reload();
  }

  async function handleEmptyTrash() {
    if (trashed.length === 0) return;
    const confirmEmpty = window.confirm(
      `¿Vaciar la papelera? Se eliminarán definitivamente ${trashed.length} registro(s) y sus fotos.`
    );
    if (!confirmEmpty) return;
    for (const item of trashed) {
      await deleteForever(item.id);
    }
    await drainOutbox();
    setTrashed([]);
    await reload();
  }

  async function changeSettings(patch: Partial<Settings>) {
    await db.settings.update("current", patch);
    setSettings(await getSettings());
  }

  // Seleccion de archivo -> procesado -> editor de alineacion.
  useEffect(() => {
    if (modal.kind !== "align") return;
    let cancelled = false;
    (async () => {
      const processed = await processImageFile(modal.file);
      if (cancelled) return;
      const preview = URL.createObjectURL(processed.display);
      const s = await getSettings();
      setAlignData({
        previewUrl: preview,
        display: processed.display,
        thumb: processed.thumb,
        width: processed.width,
        height: processed.height,
        original: s.keep_original ? modal.file : null,
      });
    })().catch(() => setModal({ kind: "none" }));
    return () => {
      cancelled = true;
    };
  }, [modal]);

  async function handleSaveAlign(t: { scale: number; rotation: number; offset_x: number; offset_y: number }) {
    if (modal.kind !== "align" || !alignData) return;
    await savePhoto(modal.checkInId, modal.viewId, {
      display: alignData.display,
      thumb: alignData.thumb,
      original: alignData.original,
      width: alignData.width,
      height: alignData.height,
      ...t,
    });
    URL.revokeObjectURL(alignData.previewUrl);
    setAlignData(null);
    setModal({ kind: "none" });
    setQuota(await storageEstimate());
    await reload();
  }

  // Reedicion de una foto ya subida: abre el mismo alineador con la
  // transformacion guardada; al guardar solo se actualiza esa transformacion.
  useEffect(() => {
    if (modal.kind !== "realign") return;
    let cancelled = false;
    (async () => {
      const url = await objectUrl(modal.photo.display_path);
      if (cancelled || !url) return;
      setRealign({ previewUrl: url });
    })().catch(() => setModal({ kind: "none" }));
    return () => {
      cancelled = true;
    };
  }, [modal]);

  async function handleSaveRealign(t: { scale: number; rotation: number; offset_x: number; offset_y: number }) {
    if (modal.kind !== "realign" || !realign) return;
    await updatePhotoTransform(modal.photo.id, t);
    URL.revokeObjectURL(realign.previewUrl);
    setRealign(null);
    setModal({ kind: "none" });
    await reload();
  }

  async function openGuides(view: ViewProfile) {
    // Foto base: la mas reciente de esa vista, si existe.
    const rows = await db.photos
      .where("view_profile_id")
      .equals(view.id)
      .filter((p) => !p.deleted_at)
      .toArray();
    const latest = rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const url = latest ? await objectUrl(latest.display_path) : null;
    setGuideBackdrop({ url, t: latest ?? null });
    setModal({ kind: "guides", view });
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-500">
        Cargando…
      </div>
    );
  }

  const current = checkIns[index] ?? null;

  if (locked) {
    return <LockScreen onUnlocked={handleUnlocked} />;
  }

  return (
    <>
      <Timeline
        settings={settings}
        views={views}
        checkIns={checkIns}
        index={index}
        storageOk={storageOk}
        onIndex={setIndex}
        onAddPhoto={(viewId) => {
          if (!current) return;
          setModal({ kind: "addchoice", viewId });
        }}
        onEditPhoto={(photo) => setModal({ kind: "realign", photo })}
        onNewCheckIn={() => setModal({ kind: "checkin" })}
        onEditCheckIn={() => current && setModal({ kind: "checkin", editing: current })}
        onMoveToTrash={(id) => current && current.id === id && handleMoveToTrash(id)}
        onOpenSettings={() => setModal({ kind: "settings" })}
        refreshKey={refreshKey}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f && current && pendingView.current) {
            setModal({ kind: "align", checkInId: current.id, viewId: pendingView.current, file: f });
          }
        }}
      />

      {modal.kind === "checkin" && (
        <CheckInForm
          occupiedDates={checkIns.map((c) => c.date)}
          initialDate={modal.editing?.date}
          initialWeightKg={modal.editing?.weight_kg}
          initialNotes={modal.editing?.notes}
          unit={settings.weight_unit}
          onSave={async (date, weightKg, notes) => {
            const row = await upsertCheckIn(date, weightKg, notes, modal.editing?.id);
            setModal({ kind: "none" });
            await reload();
            const list = await listCheckIns();
            const i = list.findIndex((c) => c.id === row.id);
            if (i >= 0) setIndex(i);
          }}
          onCancel={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "settings" && (
        <SettingsSheet
          settings={settings}
          views={views}
          storageOk={storageOk}
          quota={quota}
          protection={protection}
          trashedCount={trashed.length}
          onLocked={() => setLocked(true)}
          onSecurityChanged={async () => {
            setProtection(await protectionEnabled());
            await reload();
          }}
          onChangeSettings={changeSettings}
          onAddView={async (name) => {
            const ts = nowISO();
            const v: ViewProfile = {
              id: uuid(),
              name,
              order: views.length,
              guides: "[]",
              created_at: ts,
              updated_at: ts,
              deleted_at: null,
            };
            await db.view_profiles.add(v);
            await changeSettings({ active_view_ids: [...settings.active_view_ids, v.id] });
            setViews(await activeViews());
          }}
          onRenameView={async (id, name) => {
            await db.view_profiles.update(id, { name, updated_at: nowISO() });
            setViews(await activeViews());
          }}
          onDeleteView={async (id) => {
            await db.view_profiles.update(id, { deleted_at: nowISO(), updated_at: nowISO() });
            await changeSettings({
              active_view_ids: settings.active_view_ids.filter((x) => x !== id),
            });
            setViews(await activeViews());
          }}
          onEditGuides={(id) => {
            const v = views.find((x) => x.id === id);
            if (v) void openGuides(v);
          }}
          onImported={async () => {
            const prot = await protectionEnabled();
            // Bloquear siempre tras importar: si la copia va cifrada hace
            // falta su contrasena (puede ser otra); si ha quitado la
            // proteccion, cualquier clave en memoria deja de aplicar.
            lock();
            setProtection(prot);
            if (prot) {
              setLocked(true);
              return;
            }
            await reload();
          }}
          onClose={() => setModal({ kind: "none" })}
          onOpenTrash={() => setModal({ kind: "trash" })}
        />
      )}

      {modal.kind === "trash" && (
        <TrashView
          trashed={trashed}
          onRestore={handleRestoreFromTrash}
          onDeleteForever={handleDeleteForever}
          onEmptyTrash={handleEmptyTrash}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {/* Toast de deshacer tras mover a papelera */}
      {undoToast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-zinc-800/95 px-5 py-3 ring-1 ring-white/10 shadow-xl backdrop-blur-sm">
            <span className="text-sm text-zinc-200">
              Movido a la papelera
            </span>
            <button
              onClick={() => handleUndoTrash(undoToast.checkInId)}
              className="min-h-11 rounded-full bg-lime-400 px-4 py-1.5 text-sm font-bold text-black transition active:scale-95"
            >
              Deshacer
            </button>
          </div>
        </div>
      )}

      {modal.kind === "addchoice" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setModal({ kind: "none" })}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-t-3xl bg-zinc-900 p-5 pb-8 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-semibold">Añadir foto</p>
            <button
              onClick={() =>
                current &&
                setModal({ kind: "camera", checkInId: current.id, viewId: modal.viewId })
              }
              className="flex w-full items-center gap-3 rounded-2xl bg-zinc-800 p-4 text-left ring-1 ring-white/10 transition active:scale-[0.98]"
            >
              <IconCamera className="h-6 w-6 shrink-0 text-lime-400" />
              <span>
                <span className="block text-sm font-semibold">Cámara con guías</span>
                <span className="block text-xs text-zinc-400">
                  Cámara en directo con tus líneas encima para encuadrar igual.
                </span>
              </span>
            </button>
            <button
              onClick={() => {
                pendingView.current = modal.viewId;
                setModal({ kind: "none" });
                // El click va en el mismo gesto del usuario: diferirlo con
                // setTimeout haria que iOS no abriese el selector de archivos.
                fileRef.current?.click();
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-zinc-800 p-4 text-left ring-1 ring-white/10 transition active:scale-[0.98]"
            >
              <IconPhoto className="h-6 w-6 shrink-0 text-zinc-300" />
              <span>
                <span className="block text-sm font-semibold">Subir o hacer foto normal</span>
                <span className="block text-xs text-zinc-400">
                  Galería o cámara del sistema, como hasta ahora.
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {modal.kind === "camera" && (
        <CameraCapture
          viewId={modal.viewId}
          guides={parseGuidesSafe(views.find((v) => v.id === modal.viewId)?.guides)}
          onCapture={(file) =>
            setModal({ kind: "align", checkInId: modal.checkInId, viewId: modal.viewId, file })
          }
          onCancel={() => setModal({ kind: "none" })}
          onUseFile={() => {
            pendingView.current = modal.viewId;
            setModal({ kind: "none" });
            fileRef.current?.click();
          }}
        />
      )}

      {modal.kind === "align" && alignData && (
        <PhotoAligner
          previewSrc={alignData.previewUrl}
          baseWidth={alignData.width}
          baseHeight={alignData.height}
          guides={parseGuidesSafe(views.find((v) => v.id === modal.viewId)?.guides)}
          viewId={modal.viewId}
          onSave={handleSaveAlign}
          onCancel={() => {
            URL.revokeObjectURL(alignData.previewUrl);
            setAlignData(null);
            setModal({ kind: "none" });
          }}
        />
      )}

      {modal.kind === "realign" && realign && (
        <PhotoAligner
          previewSrc={realign.previewUrl}
          baseWidth={modal.photo.width}
          baseHeight={modal.photo.height}
          initial={{
            scale: modal.photo.scale,
            rotation: modal.photo.rotation,
            offset_x: modal.photo.offset_x,
            offset_y: modal.photo.offset_y,
          }}
          guides={parseGuidesSafe(views.find((v) => v.id === modal.photo.view_profile_id)?.guides)}
          viewId={modal.photo.view_profile_id}
          onSave={handleSaveRealign}
          onCancel={() => {
            URL.revokeObjectURL(realign.previewUrl);
            setRealign(null);
            setModal({ kind: "none" });
          }}
        />
      )}

      {modal.kind === "realign" && !realign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-neutral-400">
          Cargando foto…
        </div>
      )}

      {modal.kind === "align" && !alignData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-neutral-400">
          Procesando imagen…
        </div>
      )}

      {modal.kind === "guides" && (
        <GuideEditor
          viewName={modal.view.name}
          initial={parseGuidesSafe(modal.view.guides)}
          backdropUrl={guideBackdrop.url}
          backdropTransform={
            guideBackdrop.t
              ? {
                  width: guideBackdrop.t.width,
                  height: guideBackdrop.t.height,
                  scale: guideBackdrop.t.scale,
                  rotation: guideBackdrop.t.rotation,
                  offset_x: guideBackdrop.t.offset_x,
                  offset_y: guideBackdrop.t.offset_y,
                }
              : null
          }
          onSave={async (strokes: Stroke[]) => {
            await db.view_profiles.update(modal.view.id, {
              guides: JSON.stringify(strokes),
              updated_at: nowISO(),
            });
            setModal({ kind: "settings" });
            setViews(await activeViews());
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => setModal({ kind: "settings" })}
        />
      )}
    </>
  );
}

function parseGuidesSafe(json: string | undefined): Stroke[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
