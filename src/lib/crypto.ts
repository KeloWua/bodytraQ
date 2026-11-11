// Proteccion local con contrasena (opt-in desde Ajustes > Seguridad).
//
// Modelo: una CLAVE DE DATOS AES-GCM de 256 bits fija, generada al azar, que
// se guarda "envuelta" (cifrada) con una clave derivada de la contrasena
// (PBKDF2-SHA256, 600.000 iteraciones). La contrasena nunca se guarda y la
// clave de datos solo existe en memoria con la app desbloqueada.
//
// Por que envolver y no recifrar: cambiar la contrasena solo reescribe la
// envoltura (UNA escritura atomica en IndexedDB); los archivos nunca se
// recifran, asi que ningun corte a mitad deja fotos irrecuperables.
//
// Orden seguro ante cortes:
// - Activar: primero se guarda la envoltura, despues se cifran los datos.
//   Un corte deja proteccion activa y legible con la contrasena elegida.
// - Desactivar: primero se descifra todo, despues se borra la envoltura.
//   Un corte deja la proteccion activa; al desbloquear se recifra lo
//   descifrado a medias (autocuracion) y se puede reintentar.
// - Fotos cifradas: prefijo "BTQ1" + iv(12) + cifrado (autodescriptivo).
// - Notas cifradas: "BTQ1:" + base64(iv + cifrado).
// - NO se cifran fechas, pesos ni ajustes. Sin recuperacion de contrasena.

import db from "./db";
import { listPaths, readBlob, saveBlob, clearUrlCache } from "./storage";

const MAGIC = new Uint8Array([0x42, 0x54, 0x51, 0x31]); // "BTQ1"
const TEXT_PREFIX = "BTQ1:";
const ITERATIONS = 600_000;

let sessionKey: CryptoKey | null = null;

export class WrongPasswordError extends Error {
  constructor() {
    super("wrong-password");
  }
}

export interface ProtectionMeta {
  id: string; // siempre "protection"
  salt: string; // base64, sal del PBKDF2
  iterations: number;
  wrapped_iv: string; // base64, iv con que la KEK cifra la clave de datos
  wrapped_key: string; // base64, clave de datos cifrada con la KEK
}

function b64e(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}

function b64d(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function protectionMeta(): Promise<ProtectionMeta | null> {
  const row = await db.meta.get("protection");
  return (row as ProtectionMeta | undefined) ?? null;
}

export async function protectionEnabled(): Promise<boolean> {
  return (await protectionMeta()) !== null;
}

export function hasSession(): boolean {
  return sessionKey !== null;
}

async function deriveKek(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapDataKey(raw: Uint8Array, kek: CryptoKey): Promise<{ iv: string; key: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, kek, raw as BufferSource);
  return { iv: b64e(iv), key: b64e(new Uint8Array(ct)) };
}

// Desenvuelve la clave de datos con la contrasena. AES-GCM falla si la
// contrasena no es la correcta: eso es la verificacion.
async function unwrapDataKey(password: string, meta: ProtectionMeta): Promise<CryptoKey> {
  const kek = await deriveKek(password, b64d(meta.salt), meta.iterations);
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64d(meta.wrapped_iv) as BufferSource },
      kek,
      b64d(meta.wrapped_key) as BufferSource,
    );
  } catch {
    throw new WrongPasswordError();
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// Cifra con BTQ1 cualquier foto suelta en claro (autocuracion tras un corte
// a mitad de activacion o de desactivacion). Idempotente y barata en no-op.
async function healPlaintext(key: CryptoKey): Promise<void> {
  for (const path of await listPaths()) {
    const blob = await readBlob(path);
    if (!blob) continue;
    const next = await encryptBlob(blob, key);
    if (next !== blob) await saveBlob(path, next);
  }
  const rows = await db.check_ins.toArray();
  for (const row of rows) {
    if (row.notes && !row.notes.startsWith(TEXT_PREFIX)) {
      await db.check_ins.update(row.id, { notes: await encryptText(row.notes, key) });
    }
  }
  clearUrlCache();
}

export async function unlock(password: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) throw new Error("La proteccion no esta activada.");
  sessionKey = await unwrapDataKey(password, meta);
  await healPlaintext(sessionKey);
}

export function lock(): void {
  sessionKey = null;
  clearUrlCache();
}

// --- Cifrado de blobs (fotos) ------------------------------------------------

function hasMagic(buf: Uint8Array): boolean {
  return buf.length >= MAGIC.length && MAGIC.every((b, i) => buf[i] === b);
}

async function encryptBlob(blob: Blob, key: CryptoKey): Promise<Blob> {
  const plain = new Uint8Array(await blob.arrayBuffer());
  if (hasMagic(plain)) return blob; // ya cifrado
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource);
  const packed = new Uint8Array(MAGIC.length + iv.length + ct.byteLength);
  packed.set(MAGIC, 0);
  packed.set(iv, MAGIC.length);
  packed.set(new Uint8Array(ct), MAGIC.length + iv.length);
  return new Blob([packed], { type: "application/octet-stream" });
}

async function decryptBlob(blob: Blob, key: CryptoKey): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (!hasMagic(buf)) return blob; // ya en claro
  const iv = buf.slice(MAGIC.length, MAGIC.length + 12);
  const ct = buf.slice(MAGIC.length + 12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
  return new Blob([plain], { type: "image/jpeg" });
}

export function blobIsEncrypted(buf: Uint8Array): boolean {
  return hasMagic(buf);
}

// --- Cifrado de textos (notas) ------------------------------------------------

async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(text),
  );
  const packed = new Uint8Array(iv.length + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.length);
  return TEXT_PREFIX + b64e(packed);
}

async function decryptText(text: string, key: CryptoKey): Promise<string> {
  const packed = b64d(text.slice(TEXT_PREFIX.length));
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(plain);
}

// --- Puntos de entrada usados por la app --------------------------------------

export async function sealBlob(blob: Blob): Promise<Blob> {
  if (!sessionKey) return blob;
  return encryptBlob(blob, sessionKey);
}

export async function unsealBlob(blob: Blob): Promise<Blob | null> {
  const head = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer());
  if (!hasMagic(head)) return blob;
  if (!sessionKey) return null; // bloqueado: la UI muestra la pantalla de bloqueo
  try {
    return await decryptBlob(blob, sessionKey);
  } catch {
    return null; // no descifrable con la clave de sesion: no mostrar bytes rotos
  }
}

export async function sealText(text: string): Promise<string> {
  if (!sessionKey || text === "") return text;
  return encryptText(text, sessionKey);
}

export async function unsealText(text: string): Promise<string> {
  if (!text.startsWith(TEXT_PREFIX)) return text;
  if (!sessionKey) return text; // bloqueado: la UI no deberia llegar aqui
  try {
    return await decryptText(text, sessionKey);
  } catch {
    return text; // no cifrado con esta clave: no romper la vista
  }
}

// --- Activacion / cambio / desactivacion --------------------------------------

export async function enableProtection(password: string): Promise<void> {
  if (await protectionEnabled()) throw new Error("La proteccion ya esta activada.");
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(password, salt, ITERATIONS);
  const w = await wrapDataKey(raw, kek);
  // PRIMERO la envoltura: cualquier dato cifrado a partir de aqui siempre
  // tiene su clave recuperable con la contrasena elegida.
  await db.meta.put({
    id: "protection",
    salt: b64e(salt),
    iterations: ITERATIONS,
    wrapped_iv: w.iv,
    wrapped_key: w.key,
  });
  sessionKey = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await healPlaintext(sessionKey);
}

// Cambiar la contrasena NO recifra datos: solo desenvuelve la clave de datos
// con la contrasena actual y la envuelve con la nueva (una escritura).
export async function changePassword(current: string, next: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) throw new Error("La proteccion no esta activada.");
  const kekOld = await deriveKek(current, b64d(meta.salt), meta.iterations);
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64d(meta.wrapped_iv) as BufferSource },
      kekOld,
      b64d(meta.wrapped_key) as BufferSource,
    );
  } catch {
    throw new WrongPasswordError();
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kekNew = await deriveKek(next, salt, ITERATIONS);
  const w = await wrapDataKey(new Uint8Array(raw), kekNew);
  await db.meta.put({
    id: "protection",
    salt: b64e(salt),
    iterations: ITERATIONS,
    wrapped_iv: w.iv,
    wrapped_key: w.key,
  });
  // La clave de datos no cambia: la sesion sigue valiendo.
}

export async function disableProtection(password: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) return;
  const key = await unwrapDataKey(password, meta);
  // PRIMERO descifrar todo; si hay un corte, la proteccion sigue activa y el
  // desbloqueo recifra lo pendiente (autocuracion): nada queda irrecuperable.
  for (const path of await listPaths()) {
    const blob = await readBlob(path);
    if (!blob) continue;
    const next = await decryptBlob(blob, key);
    if (next !== blob) await saveBlob(path, next);
  }
  const rows = await db.check_ins.toArray();
  for (const row of rows) {
    if (row.notes && row.notes.startsWith(TEXT_PREFIX)) {
      try {
        await db.check_ins.update(row.id, { notes: await decryptText(row.notes, key) });
      } catch {
        // no descifrable con esta clave: se deja como esta
      }
    }
  }
  clearUrlCache();
  await db.meta.delete("protection");
  sessionKey = null;
}
