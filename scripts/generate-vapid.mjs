import { createECDH } from "node:crypto";
const key = createECDH("prime256v1");
key.generateKeys();
console.log(
  `VAPID_PUBLIC_KEY=${key.getPublicKey().toString("base64url")}\nVAPID_PRIVATE_KEY=${key.getPrivateKey().toString("base64url")}`,
);
