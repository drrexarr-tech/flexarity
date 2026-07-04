const STORAGE_KEY = 'flex_private_key';

export type KeyPair = { publicKey: JsonWebKey; privateKey: JsonWebKey };

export async function generateKeyPair(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  return {
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportAESKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

export async function importAESKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function encryptAESKey(aesKey: CryptoKey, publicKeyJwk: JsonWebKey): Promise<string> {
  const raw = await exportAESKey(aesKey);
  const pub = await importPublicKey(publicKeyJwk);
  const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
  return bufToBase64(enc);
}

export async function decryptAESKey(encryptedBase64: string, privateKeyJwk: JsonWebKey): Promise<CryptoKey> {
  const priv = await importPrivateKey(privateKeyJwk);
  const enc = base64ToBuf(encryptedBase64);
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, enc);
  return importAESKey(raw);
}

export async function encryptMessage(text: string, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufToBase64(combined.buffer);
}

export async function decryptMessage(encryptedBase64: string, aesKey: CryptoKey): Promise<string> {
  const combined = new Uint8Array(base64ToBuf(encryptedBase64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export async function encryptAudio(base64Data: string, aesKey: CryptoKey): Promise<string> {
  const raw = base64ToBuf(base64Data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, raw);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufToBase64(combined.buffer);
}

export async function decryptAudio(encryptedBase64: string, aesKey: CryptoKey): Promise<string> {
  const combined = new Uint8Array(base64ToBuf(encryptedBase64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return bufToBase64(decrypted);
}

function bufToBase64(buf: ArrayBuffer): string {
  let binary = '';
  new Uint8Array(buf).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

export function getStoredPrivateKey(): JsonWebKey | null {
  const s = localStorage.getItem(STORAGE_KEY);
  return s ? JSON.parse(s) : null;
}

export function storePrivateKey(jwk: JsonWebKey) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
}
