"use client";

import { useState } from "react";
import { unlock, WrongPasswordError } from "@/lib/crypto";
import { IconLock } from "./icons";

// Pantalla de bloqueo: solo pide la contrasena y deriva la clave en memoria.
// No hay recuperacion: si se olvida, los datos cifrados no se pueden abrir.
export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      setPassword("");
      onUnlocked();
    } catch (e) {
      setError(e instanceof WrongPasswordError ? "Contraseña incorrecta." : "No se pudo desbloquear.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-30 flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-950 p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
        <IconLock className="h-9 w-9 text-lime-400" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight">
          Body<span className="text-lime-400">TRAQ</span> bloqueado
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">Introduce tu contraseña para ver tus fotos.</p>
      </div>
      <form
        className="w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-white ring-1 ring-white/10 outline-none focus:ring-lime-400"
        />
        {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-full bg-lime-400 py-3.5 text-sm font-bold text-black shadow-lg shadow-lime-400/25 transition active:scale-95 disabled:opacity-50"
        >
          {busy ? "Comprobando…" : "Desbloquear"}
        </button>
      </form>
      <p className="max-w-xs text-center text-xs leading-relaxed text-zinc-600">
        Sin recuperación: si olvidaste la contraseña, nadie puede abrir tus datos cifrados.
      </p>
    </div>
  );
}
