import { config } from "dotenv";
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
const client = new S3Client({ endpoint: process.env.OBJECT_STORAGE_ENDPOINT, region: process.env.OBJECT_STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
const report = (check, result) => process.stdout.write(`${JSON.stringify({ check, ...result })}\n`);
const prefix = `_diagnostics/${randomUUID()}`;
const body = Buffer.from("StudyFlow storage verification\n");
const cleanup = [];
const objectUrl = (bucket, key) => `${process.env.OBJECT_STORAGE_ENDPOINT}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
let bucket = process.env.OBJECT_STORAGE_BUCKET || "uploads";
let failed = false;
try {
  try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
  catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    report("bucket_created", { ok: true, bucket });
  }
  let key = `${prefix}/source.txt`;
  cleanup.push({ bucket, key });
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
  let anonymous = await fetch(objectUrl(bucket, key));
  if (anonymous.ok) {
    // Preserve the existing bucket's access policy and use a fresh private bucket.
    if (bucket === "studyflow") throw new Error("BucketIsPublic");
    bucket = "studyflow";
    try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch (error) { if (error?.$metadata?.httpStatusCode !== 404) throw error; await client.send(new CreateBucketCommand({ Bucket: bucket })); }
    cleanup.push({ bucket, key });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
    anonymous = await fetch(objectUrl(bucket, key));
  }
  await anonymous.arrayBuffer();
  if (![401, 403, 404].includes(anonymous.status)) throw new Error("BucketPrivacyNotVerified");
  report("anonymous_read_denied", { ok: true, bucket, status: anonymous.status });

  const uploaded = `${prefix}/signed.txt`;
  cleanup.push({ bucket, key: uploaded });
  const put = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: uploaded, ContentLength: body.length, ContentType: "text/plain" }), { expiresIn: 300, signableHeaders: new Set(["content-length", "content-type"]) });
  const sent = await fetch(put, { method: "PUT", headers: { "Content-Type": "text/plain" }, body });
  if (!sent.ok) throw new Error("SignedUploadFailed");
  const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: uploaded }));
  if (metadata.ContentLength !== body.length || metadata.ContentType !== "text/plain") throw new Error("UploadMetadataMismatch");
  report("signed_put_and_head", { ok: true, bytes: metadata.ContentLength, mimeType: metadata.ContentType });
  const wrongType = await fetch(put, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body });
  await wrongType.arrayBuffer();
  if (wrongType.ok) throw new Error("UploadSignatureDidNotBindType");
  report("tampered_upload_rejected", { ok: true, status: wrongType.status });

  const copied = `${prefix}/copy.txt`;
  cleanup.push({ bucket, key: copied });
  await client.send(new CopyObjectCommand({ Bucket: bucket, Key: copied, CopySource: `${bucket}/${uploaded}`, MetadataDirective: "COPY" }));
  const get = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: copied, ResponseContentDisposition: "attachment; filename=verification.txt", ResponseCacheControl: "private, no-store" }), { expiresIn: 300 });
  const downloaded = await fetch(get);
  if (!downloaded.ok || !Buffer.from(await downloaded.arrayBuffer()).equals(body)) throw new Error("CopyOrDownloadFailed");
  report("copy_and_signed_download", { ok: true });

  let existing = [];
  try { existing = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? []; }
  catch (error) { if (!["NoSuchCORSConfiguration", "NoSuchCorsConfiguration"].includes(error?.name) && error?.$metadata?.httpStatusCode !== 404) throw error; }
  const origin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
  const rule = { AllowedOrigins: [origin], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["content-type", "content-length", "x-amz-*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 300 };
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [...existing.filter(entry => !entry.AllowedOrigins?.includes(origin)), rule] } }));
  const preflight = await fetch(objectUrl(bucket, copied), { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  const allowed = preflight.headers.get("access-control-allow-origin");
  await preflight.arrayBuffer();
  if (!preflight.ok || (allowed !== origin && allowed !== "*")) throw new Error("CorsPreflightFailed");
  report("browser_cors", { ok: true, origin });

  const path = ".env.local";
  let content = readFileSync(path, "utf8");
  for (const name of ["OBJECT_STORAGE_BUCKET", "AWS_S3_BUCKET"]) {
    const line = `${name}=${JSON.stringify(bucket)}`, pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, content);
  report("storage_configured", { ok: true, bucket });
} catch (error) {
  failed = true;
  report("storage_test", { ok: false, code: error?.name === "Error" && /^[A-Za-z]+$/.test(error.message) ? error.message : error?.name ?? "FAILED", status: error?.$metadata?.httpStatusCode });
} finally {
  let removed = 0;
  for (const object of cleanup) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key }));
      try { await client.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.key })); throw new Error("DeleteNotVerified"); }
      catch (error) { if (error?.$metadata?.httpStatusCode !== 404) throw error; }
      removed++;
    } catch { failed = true; }
  }
  report("diagnostic_objects_removed", { ok: removed === cleanup.length, count: removed });
}
process.exitCode = failed ? 1 : 0;
