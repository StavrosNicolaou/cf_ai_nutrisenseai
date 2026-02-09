const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

import { base64UrlEncode, base64UrlDecode } from '../utils/base64.js';

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input) {
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

async function hmacSha1(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, message);
}

export async function generateTotpCode(secret, timeStep = 30, digits = 6, timestamp = Date.now()) {
  const keyBytes = decodeBase32(secret);
  const counter = Math.floor(timestamp / 1000 / timeStep);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);
  const hmac = new Uint8Array(await hmacSha1(keyBytes, buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const code = binary % 10 ** digits;
  return String(code).padStart(digits, '0');
}

export async function verifyTotpCode(secret, token, window = 1) {
  const trimmed = String(token || '').replace(/\s+/g, '');
  if (!trimmed) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const code = await generateTotpCode(secret, 30, 6, now + offset * 30000);
    if (code === trimmed) return true;
  }
  return false;
}

async function deriveEncryptionKey(encryptionKey) {
  let raw = null;
  try {
    raw = encryptionKey ? base64UrlDecode(encryptionKey) : null;
  } catch {
    raw = null;
  }
  const keyBytes = raw && raw.length >= 16 ? raw : textEncoder.encode(encryptionKey || '');
  const digest = await crypto.subtle.digest('SHA-256', keyBytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret, encryptionKey) {
  const key = await deriveEncryptionKey(encryptionKey);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(secret));
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  return base64UrlEncode(payload);
}

export async function decryptSecret(payload, encryptionKey) {
  if (!payload) return null;
  const key = await deriveEncryptionKey(encryptionKey);
  const bytes = base64UrlDecode(payload);
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(plain);
}

export function buildOtpAuthUri({ secret, accountName, issuer }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret, issuer });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function buildQrCodeUrl(uri) {
  const encoded = encodeURIComponent(uri);
  return `https://quickchart.io/chart?cht=qr&chs=200x200&chl=${encoded}`;
}
