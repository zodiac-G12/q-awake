import { b64urlDecode, b64urlEncode } from "./b64";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export async function signVapidJwt(audience: string, vapid: VapidConfig): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  };
  const enc = (o: unknown) =>
    b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc(header)}.${enc(payload)}`;

  const key = await importVapidKey(vapid.publicKey, vapid.privateKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function importVapidKey(pub: string, priv: string): Promise<CryptoKey> {
  const pubBytes = b64urlDecode(pub);
  const privBytes = b64urlDecode(priv);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID public key must be 65-byte uncompressed P-256");
  }
  const x = b64urlEncode(pubBytes.slice(1, 33));
  const y = b64urlEncode(pubBytes.slice(33, 65));
  const d = b64urlEncode(privBytes);
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}
