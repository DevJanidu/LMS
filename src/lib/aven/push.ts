import "server-only";
import {
  createECDH,
  createCipheriv,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";
export function safePushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname) ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const hmac = (key: Buffer, value: Buffer) =>
  createHmac("sha256", key).update(value).digest();
const expand = (key: Buffer, info: Buffer, length: number) =>
  hmac(key, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
// RFC 8291 single-record aes128gcm, using platform crypto rather than an added dependency.
export function encryptPush(p256dh: string, auth: string, payload: string) {
  const recipient = Buffer.from(p256dh, "base64url"),
    secret = Buffer.from(auth, "base64url");
  if (
    recipient.length !== 65 ||
    recipient[0] !== 4 ||
    secret.length !== 16 ||
    Buffer.byteLength(payload) > 3000
  )
    throw new Error("invalidPushSubscription");
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const sender = ecdh.getPublicKey(),
    salt = randomBytes(16);
  const shared = ecdh.computeSecret(recipient),
    authKey = hmac(secret, shared);
  const ikm = expand(
      authKey,
      Buffer.concat([Buffer.from("WebPush: info\0"), recipient, sender]),
      32,
    ),
    prk = hmac(salt, ikm);
  const key = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
    nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", key, nonce),
    data = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([sender.length]),
    sender,
    encrypted,
  ]);
}
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
) {
  if (!safePushEndpoint(subscription.endpoint))
    throw new Error("invalidPushSubscription");
  const publicKey = process.env.VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (
    !publicKey ||
    !privateKey ||
    !subject ||
    !/^(mailto:|https:\/\/)/.test(subject)
  )
    throw new Error("pushNotConfigured");
  const raw = Buffer.from(publicKey, "base64url");
  if (raw.length !== 65) throw new Error("pushNotConfigured");
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: raw.subarray(1, 33).toString("base64url"),
      y: raw.subarray(33).toString("base64url"),
      d: privateKey,
    },
    format: "jwk",
  });
  const header = Buffer.from(
      JSON.stringify({ typ: "JWT", alg: "ES256" }),
    ).toString("base64url"),
    claims = Buffer.from(
      JSON.stringify({
        aud: new URL(subscription.endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: subject,
      }),
    ).toString("base64url");
  const input = `${header}.${claims}`,
    signature = sign("sha256", Buffer.from(input), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
  return fetch(subscription.endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `vapid t=${input}.${signature}, k=${publicKey}`,
      TTL: "3600",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(
      encryptPush(subscription.p256dh, subscription.auth, payload),
    ),
    signal: AbortSignal.timeout(4000),
  });
}
