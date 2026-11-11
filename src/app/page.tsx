"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import db, {
  activeViews,
  defaultSettings,
  ensureSeed,
  getSettings,
  listCheckIns,
  photosOf,
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
import LockScreen from "@/components/LockScreen";
import { hasSession, lock, protectionEnabled } from "@/lib/crypto";
import PhotoAligner from "@/components/PhotoAligner";
import GuideEditor from "@/components/GuideEditor";

type Modal =
  | { kind: "none" }
  | { kind: "checkin"; editing?: CheckIn }
  | { kind: "settings" }
  | { kind: "align"; checkInId: string; viewId: string; file: File }
  | { kind: "realign"; photo: Photo }
  | { kind: "guides"; view: ViewProfile };

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

  // Arranque: seed, deteccion OPFS, limpieza de archivos huerfanos. Si la
  // proteccion esta activa y no hay sesion, la pantalla de bloqueo va primero
  // y los datos (notas cifradas incluidas) solo se cargan tras desbloquear.
  useEffect(() => {
    (async () => {
      await ensureSeed();
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
      const c = await listCheckIns();
      setSettings(await getSettings());
      setViews(await activeViews());
      setCheckIns(c);
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
    const c = await listCheckIns();
    setSettings(await getSettings());
    setViews(await activeViews());
    setCheckIns(c);
    setIndex(Math.max(0, c.length - 1));
    setRefreshKey((k) => k + 1);
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
          pendingView.current = viewId;
          fileRef.current?.click();
        }}
        onEditPhoto={(photo) => setModal({ kind: "realign", photo })}
        onNewCheckIn={() => setModal({ kind: "checkin" })}
        onEditCheckIn={() => current && setModal({ kind: "checkin", editing: current })}
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
          initialDate={modal.editing?.date}
          initialWeightKg={modal.editing?.weight_kg}
          initialNotes={modal.editing?.notes}
          unit={settings.weight_unit}
          onSave={async (date, weightKg, notes) => {
            const row = await upsertCheckIn(date, weightKg, notes);
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
          onImported={reload}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "align" && alignData && (
        <PhotoAligner
          previewSrc={alignData.previewUrl}
          baseWidth={alignData.width}
          baseHeight={alignData.height}
          guides={parseGuidesSafe(views.find((v) => v.id === modal.viewId)?.guides)}
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
