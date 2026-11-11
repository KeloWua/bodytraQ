"use client";

import { useRef, useState } from "react";
import type { Settings, ViewProfile } from "@/lib/db";
import type { Quota } from "@/lib/storage";
import { importBackup, exportBackup } from "@/lib/backup";
import SecuritySection from "./SecuritySection";
import { IconDownload, IconGuides, IconPencil, IconTrash, IconUpload, IconX } from "./icons";

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2.5 text-left"
    >
      <span className="text-sm text-zinc-200">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-lime-400" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl bg-zinc-800/40 p-4 ring-1 ring-white/5">
      <h3 className="mb-3 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function SettingsSheet({
  settings,
  views,
  storageOk,
  quota,
  protection,
  onLocked,
  onSecurityChanged,
  onChangeSettings,
  onAddView,
  onRenameView,
  onDeleteView,
  onEditGuides,
  onImported,
  onClose,
}: {
  settings: Settings;
  views: ViewProfile[];
  storageOk: boolean;
  quota: Quota | null;
  protection: boolean;
  onLocked: () => void;
  onSecurityChanged: () => void;
  onChangeSettings: (patch: Partial<Settings>) => void;
  onAddView: (name: string) => void;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
  onEditGuides: (id: string) => void;
  onImported: () => void;
  onClose: () => void;
}) {
  const [newView, setNewView] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bodytraq-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage("Copia exportada.");
    } catch {
      setMessage("No se pudo exportar la copia.");
    } finally {
      setBusy(false);
    }
  }

  async function doImport(file: File) {
    if (!window.confirm("Importar sustituye TODOS los datos actuales por los de la copia. ¿Seguir?")) return;
    setBusy(true);
    setMessage(null);
    let res = await importBackup(file);
    if (res.code === "confirm-downgrade") {
      const sigue = window.confirm(
        "Esta copia NO tiene proteccion con contrasena. Al importarla se DESACTIVARA la proteccion actual y tus fotos y notas quedaran sin cifrar. ¿Importar igualmente?"
      );
      if (!sigue) {
        setBusy(false);
        setMessage("Importacion cancelada: la proteccion sigue activa.");
        return;
      }
      res = await importBackup(file, { confirmedDowngrade: true });
    }
    setBusy(false);
    if (res.ok) {
      setMessage(`Copia restaurada: ${res.checkIns} registros, ${res.photos} fotos.`);
      onImported();
    } else {
      setMessage(res.error ?? "No se pudo importar.");
    }
  }

  // Muestra KB por debajo de 1 MB para que "0 MB" no esconda fotos reales.
  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1e6) return `${Math.round(n / 1024)} KB`;
    if (n < 1e9) return `${Math.round((n / 1e6) * 10) / 10} MB`;
    return `${Math.round((n / 1e9) * 10) / 10} GB`;
  }
  const uso = quota ? fmtBytes(quota.usage) : null;
  const limite = quota ? fmtBytes(quota.quota) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="bt-sheet-up h-full w-full max-w-md overflow-y-auto bg-zinc-900 p-5 ring-1 ring-white/10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Ajustes</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
          >
            <IconX className="h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>

        {!storageOk && (
          <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            Este navegador no tiene OPFS: las fotos NO se pueden guardar de forma duradera
            aquí. La app no usará otro almacenamiento sin tu permiso. Usa un navegador
            actual (Chrome, Edge, Firefox o Safari 15.2+).
          </div>
        )}

        <Section title="Cuerpo">
          <label className="mb-1.5 block text-xs text-zinc-400">Altura (cm, para el IMC)</label>
          <input
            type="number"
            inputMode="decimal"
            value={settings.height_cm ?? ""}
            onChange={(e) =>
              onChangeSettings({ height_cm: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="w-full rounded-xl bg-zinc-800/70 px-4 py-2.5 ring-1 ring-white/10 outline-none focus:ring-lime-400"
          />
          <div className="mt-3 flex rounded-full bg-zinc-800 p-1 ring-1 ring-white/10">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                onClick={() => onChangeSettings({ weight_unit: u })}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                  settings.weight_unit === u ? "bg-lime-400 text-black" : "text-zinc-400"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Timeline">
          <div className="mb-1 flex rounded-full bg-zinc-800 p-1 ring-1 ring-white/10">
            {(["single", "dual"] as const).map((l) => (
              <button
                key={l}
                onClick={() => onChangeSettings({ default_layout: l })}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                  settings.default_layout === l ? "bg-lime-400 text-black" : "text-zinc-400"
                }`}
              >
                {l === "single" ? "1 foto" : "2 fotos"}
              </button>
            ))}
          </div>
          <Switch
            checked={settings.show_date}
            onChange={(v) => onChangeSettings({ show_date: v })}
            label="Mostrar fecha"
          />
          <Switch
            checked={settings.show_weight}
            onChange={(v) => onChangeSettings({ show_weight: v })}
            label="Mostrar peso"
          />
          <Switch
            checked={settings.show_bmi}
            onChange={(v) => onChangeSettings({ show_bmi: v })}
            label="Mostrar IMC"
          />
          <Switch
            checked={settings.keep_original}
            onChange={(v) => onChangeSettings({ keep_original: v })}
            label="Guardar también la foto original intacta"
          />
        </Section>

        <Section title="Vistas">
          {views.map((v) => (
            <div key={v.id} className="mb-3">
            <div className="flex items-center gap-2">
              <button
                role="checkbox"
                aria-checked={settings.active_view_ids.includes(v.id)}
                onClick={() =>
                  onChangeSettings({
                    active_view_ids: settings.active_view_ids.includes(v.id)
                      ? settings.active_view_ids.filter((id) => id !== v.id)
                      : [...settings.active_view_ids, v.id],
                  })
                }
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition ${
                  settings.active_view_ids.includes(v.id)
                    ? "border-transparent bg-lime-400 text-black"
                    : "border-transparent bg-zinc-800 ring-white/15"
                }`}
              >
                {settings.active_view_ids.includes(v.id) && <IconX className="hidden" />}
                {settings.active_view_ids.includes(v.id) && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm">{v.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 pl-7">
              <button
                onClick={() => onEditGuides(v.id)}
                className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
              >
                <IconGuides className="h-3 w-3" />
                Guías
              </button>
              <button
                onClick={() => {
                  const name = window.prompt("Nombre de la vista", v.name);
                  if (name?.trim()) onRenameView(v.id, name.trim());
                }}
                className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10 transition active:scale-95"
              >
                <IconPencil className="h-3 w-3" />
                Renombrar
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`¿Borrar la vista "${v.name}"? Las fotos ya subidas no se borran.`))
                    onDeleteView(v.id);
                }}
                className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-red-300 ring-1 ring-white/10 transition active:scale-95"
              >
                <IconTrash className="h-3 w-3" />
                Borrar
              </button>
            </div>
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <input
              value={newView}
              onChange={(e) => setNewView(e.target.value)}
              placeholder="Nueva vista (p. ej. Lateral)"
              className="flex-1 rounded-xl bg-zinc-800/70 px-4 py-2.5 text-sm ring-1 ring-white/10 outline-none focus:ring-lime-400"
            />
            <button
              onClick={() => {
                if (newView.trim()) {
                  onAddView(newView.trim());
                  setNewView("");
                }
              }}
              className="rounded-full bg-lime-400 px-5 py-2.5 text-sm font-bold text-black transition active:scale-95"
            >
              Añadir
            </button>
          </div>
        </Section>

        <SecuritySection enabled={protection} onLocked={onLocked} onChanged={onSecurityChanged} />

        <Section title="Copia de seguridad">
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Exporta un ZIP con todas las fotos y la base de datos. Guárdalo fuera del
            dispositivo: el navegador puede purgar el almacenamiento local.{" "}
            {protection
              ? "La copia va cifrada con tu contraseña (se abre con ella al importarla)."
              : "La copia NO va cifrada: actívala en Seguridad si quieres que lo esté."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={doExport}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-lime-400 py-2.5 text-sm font-bold text-black transition active:scale-95 disabled:opacity-50"
            >
              <IconDownload className="h-4 w-4" />
              Exportar ZIP
            </button>
            <button
              onClick={() => importRef.current?.click()}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-zinc-800 py-2.5 text-sm font-medium ring-1 ring-white/10 transition active:scale-95 disabled:opacity-50"
            >
              <IconUpload className="h-4 w-4" />
              Importar ZIP
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = "";
              }}
            />
          </div>
          {message && <p className="mt-3 text-xs text-zinc-300">{message}</p>}
        </Section>

        <section className="px-1 text-xs text-zinc-500">
          <p>
            Almacenamiento: {storageOk ? "OPFS (privado del navegador)" : "sin OPFS"}
            {uso !== null && limite !== null ? ` · usado ${uso} de ~${limite}` : ""}
          </p>
          <p className="mt-1">Todo se guarda solo en este dispositivo.</p>
        </section>
      </div>
    </div>
  );
}
