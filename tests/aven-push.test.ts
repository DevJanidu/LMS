import { createECDH, createHmac, createDecipheriv } from "node:crypto";
import { expect, it } from "vitest";
import { encryptPush, safePushEndpoint } from "@/lib/aven/push";
it("rejects arbitrary/private push endpoints", () => {
  expect(safePushEndpoint("http://127.0.0.1/admin")).toBe(false);
  expect(
    safePushEndpoint("https://fcm.googleapis.com.attacker.example/a"),
  ).toBe(false);
  expect(safePushEndpoint("https://fcm.googleapis.com/fcm/send/example")).toBe(
    true,
  );
});
it("encrypts an RFC 8291 record that the recipient can authenticate and decrypt", () => {
  const recipient = createECDH("prime256v1");
  recipient.generateKeys();
  const auth = Buffer.alloc(16, 7),
    message = "Private study reminder";
  const record = encryptPush(
      recipient.getPublicKey().toString("base64url"),
      auth.toString("base64url"),
      message,
    ),
    sender = record.subarray(21, 86),
    salt = record.subarray(0, 16);
  const hmac = (key: Buffer, value: Buffer) =>
    createHmac("sha256", key).update(value).digest();
  const expand = (key: Buffer, info: Buffer, length: number) =>
    hmac(key, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
  const secret = recipient.computeSecret(sender),
    authKey = hmac(auth, secret),
    ikm = expand(
      authKey,
      Buffer.concat([
        Buffer.from("WebPush: info\0"),
        recipient.getPublicKey(),
        sender,
      ]),
      32,
    ),
    prk = hmac(salt, ikm);
  const decipher = createDecipheriv(
    "aes-128-gcm",
    expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
    expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  decipher.setAuthTag(record.subarray(-16));
  const plaintext = Buffer.concat([
    decipher.update(record.subarray(86, -16)),
    decipher.final(),
  ]);
  expect(plaintext.subarray(0, -1).toString()).toBe(message);
  expect(plaintext.at(-1)).toBe(2);
});
