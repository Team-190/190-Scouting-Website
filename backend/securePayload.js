const crypto = require("crypto");
const zlib = require("zlib");

const DEFAULT_ITERATIONS = 120000;
const TAG_LENGTH_BYTES = 16;
const EXPECTED_IV_LENGTH_BYTES = 12;
const EXPECTED_KEY_LENGTH_BYTES = 32;

function isSecurePayloadEnvelope(body) {
  return Boolean(body && typeof body === "object" && body.__securePayload === true);
}

function getPayloadSecret() {
  return String(
    process.env.VITE_PAYLOAD_ENCRYPTION_KEY
      || process.env.VITE_AUTH_KEY
      || process.env.PAYLOAD_ENCRYPTION_KEY
      || process.env.SESSION_SECRET
      || "scouting-payload-default-key"
      || "",
  ).trim();
}

function decodeBase64(value) {
  if (!value || typeof value !== "string") {
    throw new Error("Missing required secure payload field");
  }

  return Buffer.from(value, "base64");
}

function decodeSecurePayload(envelope) {
  const secret = getPayloadSecret();

  const iterations = Number(envelope.iterations || DEFAULT_ITERATIONS);
  if (!Number.isInteger(iterations) || iterations < 1000) {
    throw new Error("Invalid secure payload iteration count");
  }

  const salt = decodeBase64(envelope.salt);
  const iv = decodeBase64(envelope.iv);
  const encrypted = decodeBase64(envelope.data);

  if (iv.length !== EXPECTED_IV_LENGTH_BYTES) {
    throw new Error("Invalid IV length in secure payload");
  }

  if (encrypted.length <= TAG_LENGTH_BYTES) {
    throw new Error("Secure payload is too short to decrypt");
  }

  const key = crypto.pbkdf2Sync(
    secret,
    salt,
    iterations,
    EXPECTED_KEY_LENGTH_BYTES,
    "sha256",
  );

  const authTag = encrypted.subarray(encrypted.length - TAG_LENGTH_BYTES);
  const cipherText = encrypted.subarray(0, encrypted.length - TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([
    decipher.update(cipherText),
    decipher.final(),
  ]);

  let payloadBuffer = compressed;
  if ((envelope.compression || "").toLowerCase() === "gzip") {
    payloadBuffer = zlib.gunzipSync(compressed);
  }

  return JSON.parse(payloadBuffer.toString("utf8"));
}

module.exports = {
  decodeSecurePayload,
  isSecurePayloadEnvelope,
};
