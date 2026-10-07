import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getSettings, ownedSubject } from "./workspace";
import { DomainError } from "./mutations";
import { headObject, uploadUrl, copyObject } from "@/lib/storage";
import { uploadSchema } from "@/lib/validation";
import type { z } from "zod";
import { invalidateUser } from "@/lib/cache";

export async function requestUpload(userId: string, value: z.infer<typeof uploadSchema>) {
  await ownedSubject(userId, value.subjectId);
  const limits = await getSettings();
  if (value.sizeBytes > limits.maxFileSizeMB * 1048576) throw new DomainError("fileTooLargeGeneric");
  const key = `users/${userId}/subjects/${value.subjectId}/pending/${crypto.randomUUID()}`;
  const id = crypto.randomUUID();
  await getDb().transaction(async tx => {
    const [actor] = await tx.select({ status: s.users.status, role: s.users.role }).from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!actor || actor.status !== "active" || actor.role !== "learner") throw new DomainError("accountInactive");
    const [subject] = await tx.select({ id: s.subjects.id }).from(s.subjects).where(and(eq(s.subjects.id, value.subjectId), eq(s.subjects.userId, userId)));
    if (!subject) throw new DomainError("recordUnavailable");
    if (value.topicId) {
      const [topic] = await tx.select({ id: s.topics.id }).from(s.topics).where(and(eq(s.topics.id, value.topicId), eq(s.topics.subjectId, value.subjectId)));
      if (!topic) throw new DomainError("recordUnavailable");
    }
    const [used] = await tx.select({ bytes: sql<number>`coalesce(sum(${s.resources.sizeBytes}), 0)::bigint` }).from(s.resources).where(eq(s.resources.userId, userId));
    const [reserved] = await tx.select({ bytes: sql<number>`coalesce(sum(${s.pendingUploads.sizeBytes}), 0)::bigint` }).from(s.pendingUploads).where(eq(s.pendingUploads.userId, userId));
    if (Number(used.bytes) + Number(reserved.bytes) + value.sizeBytes > limits.storagePerUserMB * 1048576) throw new DomainError("storageLimit");
    await tx.insert(s.pendingUploads).values({ id, userId, subjectId: value.subjectId, topicId: value.topicId, title: value.title, storageKey: key, mimeType: value.mimeType, sizeBytes: value.sizeBytes });
  });
  return { id, url: await uploadUrl(key, value.mimeType, value.sizeBytes) };
}
export async function confirmUpload(userId: string, id: string) {
  const limits = await getSettings();
  const [candidate] = await getDb().select().from(s.pendingUploads).where(and(eq(s.pendingUploads.id, id), eq(s.pendingUploads.userId, userId)));
  if (candidate) await getDb().insert(s.pendingObjectDeletions).values({ storageKey: `users/${userId}/subjects/${candidate.subjectId}/${id}` }).onConflictDoNothing();
  await getDb().transaction(async tx => {
    const [actor] = await tx.select({ status: s.users.status, role: s.users.role }).from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!actor || actor.status !== "active" || actor.role !== "learner") throw new DomainError("accountInactive");
    const [upload] = await tx.select().from(s.pendingUploads).where(and(eq(s.pendingUploads.id, id), eq(s.pendingUploads.userId, userId))).for("update");
    if (!upload) {
      const [already] = await tx.select({ id: s.resources.id }).from(s.resources).where(and(eq(s.resources.id, id), eq(s.resources.userId, userId)));
      if (already) return;
      throw new DomainError("recordUnavailable");
    }
    const metadata = await headObject(upload.storageKey);
    if (metadata.ContentLength !== upload.sizeBytes || metadata.ContentType !== upload.mimeType || upload.sizeBytes > limits.maxFileSizeMB * 1048576) throw new DomainError("invalidFileType");
    const [used] = await tx.select({ bytes: sql<number>`coalesce(sum(${s.resources.sizeBytes}), 0)::bigint` }).from(s.resources).where(eq(s.resources.userId, userId));
    if (Number(used.bytes) + upload.sizeBytes > limits.storagePerUserMB * 1048576) throw new DomainError("storageLimit");
    // Copy to an immutable final key; a reusable PUT URL cannot overwrite a confirmed file.
    const finalKey = `users/${userId}/subjects/${upload.subjectId}/${upload.id}`;
    await copyObject(upload.storageKey, finalKey);
    const finalMetadata = await headObject(finalKey);
    if (finalMetadata.ContentLength !== upload.sizeBytes || finalMetadata.ContentType !== upload.mimeType) throw new DomainError("invalidFileType");
    await tx.insert(s.resources).values({ id: upload.id, userId, subjectId: upload.subjectId, topicId: upload.topicId, type: "file", title: upload.title, storageKey: finalKey, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes });
    await tx.delete(s.pendingObjectDeletions).where(eq(s.pendingObjectDeletions.storageKey, finalKey));
    await tx.delete(s.pendingUploads).where(eq(s.pendingUploads.id, id));
  });
  await invalidateUser(userId, ["subjects"]);
}
