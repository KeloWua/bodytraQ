// Proteccion local con contrasena (opt-in desde Ajustes > Seguridad).
//
// - PBKDF2-SHA256 (600.000 iteraciones) deriva una clave AES-GCM de 256 bits.
// - La clave SOLO vive en memoria mientras la app esta desbloqueada; la
//   contrasena nunca se guarda. Solo se guarda sal + un verificador cifrado.
// - Fotos cifradas (OPFS): "BTQ1" (4 bytes) + iv(12) + cifrado. El prefijo
//   hace cada archivo autodescriptivo: un corte a mitad de la migracion no
//   deja estado mixto ilegible.
// - Notas cifradas (IndexedDB): "BTQ1:" + base64(iv + cifrado).
// - NO se cifran: fechas, pesos ni ajustes (metadatos necesarios para la app).
// - Sin recuperacion: si se olvida la contrasena, los datos cifrados no se
//   pueden abrir. El usuario lo confirma expresamente al activarla.

import db from "./db";
import { listPaths, readBlob, saveBlob, clearUrlCache } from "./storage";

const MAGIC = new Uint8Array([0x42, 0x54, 0x51, 0x31]); // "BTQ1"
const TEXT_PREFIX = "BTQ1:";
const ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = "bodytraq-key-check-v1";

let sessionKey: CryptoKey | null = null;

export class WrongPasswordError extends Error {
  constructor() {
    super("wrong-password");
  }
}

export interface ProtectionMeta {
  id: string; // siempre "protection"
  salt: string; // base64
  verifier_iv: string; // base64
  verifier_ct: string; // base64
  iterations: number;
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

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
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

async function makeVerifier(key: CryptoKey): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(VERIFIER_PLAINTEXT),
  );
  return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
}

async function checkVerifier(key: CryptoKey, meta: ProtectionMeta): Promise<boolean> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64d(meta.verifier_iv) as BufferSource },
      key,
      b64d(meta.verifier_ct) as BufferSource,
    );
    return new TextDecoder().decode(pt) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

export async function unlock(password: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) throw new Error("La proteccion no esta activada.");
  const key = await deriveKey(password, b64d(meta.salt), meta.iterations);
  if (!(await checkVerifier(key, meta))) throw new WrongPasswordError();
  sessionKey = key;
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

// Escritura de fotos: cifrar si hay sesion activa.
export async function sealBlob(blob: Blob): Promise<Blob> {
  if (!sessionKey) return blob;
  return encryptBlob(blob, sessionKey);
}

// Lectura de fotos: descifrar si el archivo lleva el prefijo. Sin sesion no
// se puede leer: devuelve null y la interfaz (detras de la pantalla de
// bloqueo) no muestra nada.
export async function unsealBlob(blob: Blob): Promise<Blob | null> {
  const head = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer());
  if (!hasMagic(head)) return blob;
  if (!sessionKey) return null;
  return decryptBlob(blob, sessionKey);
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

// --- Activacion / migracion / cambio / desactivacion --------------------------

// Cifra todos los datos existentes (fotos en OPFS y notas). Seguro ante
// cortes: cada archivo/nota cifrado se marca con el prefijo BTQ1.
async function migrateAll(direction: "encrypt" | "decrypt", key: CryptoKey): Promise<void> {
  for (const path of await listPaths()) {
    const blob = await readBlob(path);
    if (!blob) continue;
    const next =
      direction === "encrypt" ? await encryptBlob(blob, key) : await decryptBlob(blob, key);
    if (next !== blob) {
      await saveBlob(path, next);
    }
  }
  clearUrlCache();
  const rows = await db.check_ins.toArray();
  for (const row of rows) {
    if (!row.notes) continue;
    if (direction === "encrypt") {
      if (!row.notes.startsWith(TEXT_PREFIX)) {
        await db.check_ins.update(row.id, { notes: await encryptText(row.notes, key) });
      }
    } else if (row.notes.startsWith(TEXT_PREFIX)) {
      try {
        await db.check_ins.update(row.id, { notes: await decryptText(row.notes, key) });
      } catch {
        // no se puede descifrar con esta clave: se deja como esta
      }
    }
  }
}

export async function enableProtection(password: string): Promise<void> {
  if (await protectionEnabled()) throw new Error("La proteccion ya esta activada.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, ITERATIONS);
  const v = await makeVerifier(key);
  sessionKey = key;
  try {
    await migrateAll("encrypt", key);
    await db.meta.put({
      id: "protection",
      salt: b64e(salt),
      verifier_iv: v.iv,
      verifier_ct: v.ct,
      iterations: ITERATIONS,
    });
  } catch (e) {
    sessionKey = null;
    throw e;
  }
}

export async function changePassword(current: string, next: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) throw new Error("La proteccion no esta activada.");
  const oldKey = await deriveKey(current, b64d(meta.salt), meta.iterations);
  if (!(await checkVerifier(oldKey, meta))) throw new WrongPasswordError();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const newKey = await deriveKey(next, salt, ITERATIONS);
  // Recifrar todo con la nueva clave.
  for (const path of await listPaths()) {
    const blob = await readBlob(path);
    if (!blob) continue;
    const plain = await decryptBlob(blob, oldKey);
    await saveBlob(path, await encryptBlob(plain, newKey));
  }
  clearUrlCache();
  const rows = await db.check_ins.toArray();
  for (const row of rows) {
    if (row.notes && row.notes.startsWith(TEXT_PREFIX)) {
      const plain = await decryptText(row.notes, oldKey);
      await db.check_ins.update(row.id, { notes: await encryptText(plain, newKey) });
    }
  }
  const v = await makeVerifier(newKey);
  await db.meta.put({
    id: "protection",
    salt: b64e(salt),
    verifier_iv: v.iv,
    verifier_ct: v.ct,
    iterations: ITERATIONS,
  });
  sessionKey = newKey;
}

export async function disableProtection(password: string): Promise<void> {
  const meta = await protectionMeta();
  if (!meta) return;
  const key = await deriveKey(password, b64d(meta.salt), meta.iterations);
  if (!(await checkVerifier(key, meta))) throw new WrongPasswordError();
  await migrateAll("decrypt", key);
  await db.meta.delete("protection");
  sessionKey = null;
  clearUrlCache();
}
