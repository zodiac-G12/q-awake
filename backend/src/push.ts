import { b64urlDecode, concat } from "./b64";
import { signVapidJwt, VapidConfig } from "./vapid";

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendPush(
  sub: PushSubscriptionJSON,
  payload: Uint8Array | null,
  vapid: VapidConfig,
): Promise<Response> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapidJwt(audience, vapid);

  const headers: Record<string, string> = {
    TTL: "60",
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
  };

  let body: BodyInit | null = null;
  if (payload) {
    const encrypted = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);
    body = encrypted;
    headers["Content-Encoding"] = "aes128gcm";
    headers["Content-Type"] = "application/octet-stream";
    headers["Content-Length"] = String(encrypted.length);
  } else {
    headers["Content-Length"] = "0";
  }

  return await fetch(sub.endpoint, { method: "POST", headers, body });
}

// RFC 8291 — aes128gcm content encoding for Web Push
async function encryptPayload(
  payload: Uint8Array,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);

  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(
    (await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer,
  );

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: "ECDH", public: uaKey } as any,
      asKeyPair.privateKey,
      256,
    ),
  );

  const info1 = concat(
    new TextEncoder().encode("WebPush: info\0"),
    uaPublic,
    asPublicRaw,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, info1, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload);
  padded[payload.length] = 0x02; // last-record delimiter

  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded),
  );

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concat(header, ciphertext);
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}
