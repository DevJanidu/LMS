import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const env = parse(readFileSync(".env.production", "utf8"));
const app = new URL(env.APP_URL);
if (app.protocol !== "https:" || app.origin !== env.APP_URL) throw new Error("Set APP_URL to the final HTTPS origin first.");
const client = new S3Client({ endpoint: env.OBJECT_STORAGE_ENDPOINT, region: env.OBJECT_STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY }, maxAttempts: 1 });
const send = command => client.send(command, { abortSignal: AbortSignal.timeout(15000) });
let stage = "read_cors";
try {
  let rules = [];
  try { rules = (await send(new GetBucketCorsCommand({ Bucket: env.OBJECT_STORAGE_BUCKET }))).CORSRules ?? []; }
  catch (error) { if (!["NoSuchCORSConfiguration", "NoSuchCorsConfiguration"].includes(error?.name)) throw error; }
  const complete = rules.some(rule => rule.AllowedOrigins?.includes(app.origin) && ["PUT", "GET", "HEAD"].every(method => rule.AllowedMethods?.includes(method)) && rule.AllowedHeaders?.includes("*"));
  if (!complete) {
    // Preserve every existing origin/rule, including the user's local setup.
    rules.push({ AllowedOrigins: [app.origin], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 300 });
    stage = "write_cors";
    await send(new PutBucketCorsCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, CORSConfiguration: { CORSRules: rules } }));
  }
  const endpoint = `${env.OBJECT_STORAGE_ENDPOINT.replace(/\/$/, "")}/${encodeURIComponent(env.OBJECT_STORAGE_BUCKET)}/_diagnostics/cors-preflight`;
  stage = "preflight";
  const response = await fetch(endpoint, { method: "OPTIONS", headers: { Origin: app.origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-amz-checksum-crc32" }, signal: AbortSignal.timeout(15000) });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  if (!response.ok || ![app.origin, "*"].includes(allowedOrigin)) {
    console.error(JSON.stringify({ check: "preflight", ok: false, status: response.status, allowedOrigin }));
    throw new Error("Preflight verification failed.");
  }
  console.log(JSON.stringify({ check: "production_storage_cors", ok: true, origin: app.origin, existingRulesPreserved: true }));
} catch (error) {
  console.error(JSON.stringify({ check: "production_storage_cors", ok: false, stage, code: /^[A-Za-z0-9_]+$/.test(error?.name ?? "") ? error.name : "FAILED", status: error?.$metadata?.httpStatusCode }));
  process.exitCode = 1;
} finally { client.destroy(); }
