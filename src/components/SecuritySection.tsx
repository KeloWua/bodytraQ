"use client";

import { useState } from "react";
import {
  changePassword,
  disableProtection,
  enableProtection,
  lock,
  WrongPasswordError,
} from "@/lib/crypto";

// Seccion "Seguridad" de Ajustes: activar/bloquear/cambiar/desactivar la
// proteccion con contrasena. Todo ocurre en el dispositivo; la contrasena
// nunca sale de aqui ni se guarda.
export default function SecuritySection({
  enabled,
  onLocked,
  onChanged,
}: {
  enabled: boolean;
  onLocked: () => void;
  onChanged: () => void;
}) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwOld, setPwOld] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-xl bg-zinc-800/70 px-4 py-2.5 text-sm ring-1 ring-white/10 outline-none focus:ring-lime-400";

  async function run(fn: () => Promise<void>, okMsg: string) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await fn();
      setMsg(okMsg);
      setPw1("");
      setPw2("");
      setPwOld("");
      setUnderstood(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof WrongPasswordError ? "Contraseña incorrecta." : "No se pudo completar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl bg-zinc-800/40 p-4 ring-1 ring-white/5">
      <h3 className="mb-3 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
        Seguridad
      </h3>

      {!enabled ? (
        <>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Cifra tus <strong className="text-zinc-200">fotos y notas</strong> en este dispositivo
            con AES-256. La contraseña no se guarda en ningún sitio: sin ella nadie puede abrir
            tus datos, ni siquiera con acceso al almacenamiento del navegador.
          </p>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Fechas, pesos y ajustes no se cifran. Las copias ZIP también van cifradas y se abren
            con esta misma contraseña.
          </p>
          <p className="mb-3 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200 ring-1 ring-amber-500/30">
            Si olvidas la contraseña NO hay recuperación posible.
          </p>
          <div className="space-y-2.5">
            <input
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="Contraseña (mín. 6 caracteres)"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Repite la contraseña"
              className={inputCls}
            />
            <button
              role="checkbox"
              aria-checked={understood}
              onClick={() => setUnderstood((v) => !v)}
              className="flex items-start gap-2.5 py-1 text-left"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition ${
                  understood ? "border-transparent bg-lime-400 text-black" : "border-transparent bg-zinc-800 ring-white/15"
                }`}
              >
                {understood && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-xs leading-relaxed text-zinc-300">
                Entiendo que si olvido la contraseña no hay forma de recuperar mis fotos ni mis notas.
              </span>
            </button>
            <button
              disabled={busy || pw1.length < 6 || pw1 !== pw2 || !understood}
              onClick={() => void run(() => enableProtection(pw1), "Protección activada. Tus fotos y notas ya están cifradas.")}
              className="w-full rounded-full bg-lime-400 py-2.5 text-sm font-bold text-black transition active:scale-95 disabled:opacity-50"
            >
              {busy ? "Cifrando tus datos…" : "Activar protección"}
            </button>
            {pw1.length > 0 && pw2.length > 0 && pw1 !== pw2 && (
              <p className="text-xs text-red-400">Las contraseñas no coinciden.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Protección activa: fotos y notas cifradas con tu contraseña. La app se bloquea sola
            tras 5 minutos en segundo plano.
          </p>
          <button
            onClick={() => {
              lock();
              onLocked();
            }}
            className="mb-3 w-full rounded-full bg-zinc-800 py-2.5 text-sm font-medium ring-1 ring-white/10 transition active:scale-95"
          >
            Bloquear ahora
          </button>
          <div className="space-y-2.5 border-t border-white/5 pt-3">
            <p className="text-xs font-medium text-zinc-300">Cambiar contraseña</p>
            <input
              type="password"
              autoComplete="current-password"
              value={pwOld}
              onChange={(e) => setPwOld(e.target.value)}
              placeholder="Contraseña actual"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="Nueva contraseña (mín. 6)"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className={inputCls}
            />
            <button
              disabled={busy || !pwOld || pw1.length < 6 || pw1 !== pw2}
              onClick={() => void run(() => changePassword(pwOld, pw1), "Contraseña cambiada y datos recifrados.")}
              className="w-full rounded-full bg-zinc-800 py-2.5 text-sm font-medium ring-1 ring-white/10 transition active:scale-95 disabled:opacity-50"
            >
              {busy ? "Recifrando…" : "Cambiar contraseña"}
            </button>
          </div>
          <div className="space-y-2.5 border-t border-white/5 pt-3 mt-3">
            <p className="text-xs font-medium text-zinc-300">Desactivar protección</p>
            <p className="text-xs leading-relaxed text-zinc-500">
              Descifra todas tus fotos y notas y quita la pantalla de bloqueo.
            </p>
            <button
              disabled={busy || !pwOld}
              onClick={() => {
                if (window.confirm("¿Descifrar todos los datos y desactivar la protección?"))
                  void run(() => disableProtection(pwOld), "Protección desactivada. Datos descifrados.");
              }}
              className="w-full rounded-full bg-red-500/10 py-2.5 text-sm font-medium text-red-300 ring-1 ring-red-500/30 transition active:scale-95 disabled:opacity-50"
            >
              Desactivar y descifrar
            </button>
          </div>
        </>
      )}
      {msg && <p className="mt-3 text-xs text-lime-300">{msg}</p>}
      {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
    </section>
  );
}
