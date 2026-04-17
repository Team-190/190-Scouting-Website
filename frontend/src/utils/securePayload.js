import pako from "pako";

const KEY_LENGTH_BITS = 256;
const PBKDF2_ITERATIONS = 120000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;
const textEncoder = new TextEncoder();

function toBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function deriveEncryptionKey(passphrase, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: KEY_LENGTH_BITS,
    },
    false,
    ["encrypt"],
  );
}

function getPayloadSecret() {
  const candidate = String(
    import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY
      || import.meta.env.VITE_AUTH_KEY
      || "scouting-payload-default-key",
  ).trim();
  return candidate;
}

export async function secureEncodePayload(payload) {
  const secret = getPayloadSecret();

  const json = JSON.stringify(payload);
  const compressed = pako.gzip(json, { level: 9 });
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveEncryptionKey(secret, salt, PBKDF2_ITERATIONS);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    compressed,
  );

  return {
    __securePayload: true,
    version: 1,
    compression: "gzip",
    encryption: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encryptedBuffer)),
  };
}
