import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/lib/env";
import { uploadTypes } from "@/lib/validation";
let client: S3Client | undefined;
function storage() {
  const env = getEnv();
  return client ??= new S3Client({ endpoint: env.OBJECT_STORAGE_ENDPOINT, region: env.OBJECT_STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
}
export function uploadUrl(key: string, mimeType: string, size: number) {
  return getSignedUrl(storage(), new PutObjectCommand({ Bucket: getEnv().OBJECT_STORAGE_BUCKET, Key: key, ContentType: mimeType, ContentLength: size }), { expiresIn: 300, signableHeaders: new Set(["content-length", "content-type"]) });
}
export function headObject(key: string) { return storage().send(new HeadObjectCommand({ Bucket: getEnv().OBJECT_STORAGE_BUCKET, Key: key })); }
export function deleteObject(key: string) { return storage().send(new DeleteObjectCommand({ Bucket: getEnv().OBJECT_STORAGE_BUCKET, Key: key })); }
export function copyObject(source: string, target: string) {
  return storage().send(new CopyObjectCommand({ Bucket: getEnv().OBJECT_STORAGE_BUCKET, Key: target, CopySource: `${getEnv().OBJECT_STORAGE_BUCKET}/${source.split("/").map(encodeURIComponent).join("/")}`, MetadataDirective: "COPY" }));
}
export function downloadUrl(key: string, title: string, mimeType?: string | null) {
  const extension = mimeType ? uploadTypes[mimeType]?.[0] : undefined;
  const name = title.replace(/[\r\n/\\]/g, "_");
  const filename = encodeURIComponent(extension && !name.toLowerCase().endsWith(`.${extension}`) ? `${name}.${extension}` : name);
  return getSignedUrl(storage(), new GetObjectCommand({ Bucket: getEnv().OBJECT_STORAGE_BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${filename}`, ResponseCacheControl: "private, no-store" }), { expiresIn: 300 });
}
