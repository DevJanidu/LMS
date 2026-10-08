import "server-only";
import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import type { Resource } from "@/types";

export const resourceFilterSchema = z.object({
  page: z.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(100).default(""),
  subjectId: z.string().uuid().optional(), topicId: z.string().uuid().optional(),
  type: z.enum(["file", "link", "video", "note"]).optional(),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
});
export interface ResourcePage { total: number; rows: Resource[] }
/** Filter and paginate in SQL. Note bodies and storage keys never enter lists. */
export async function listResources(userId: string, filter: z.infer<typeof resourceFilterSchema>): Promise<ResourcePage> {
  const db = getDb(), pattern = `%${filter.search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(eq(resources.userId, userId), filter.subjectId ? eq(resources.subjectId, filter.subjectId) : undefined, filter.topicId ? eq(resources.topicId, filter.topicId) : undefined, filter.type ? eq(resources.type, filter.type) : undefined, filter.search ? ilike(resources.title, pattern) : undefined);
  const order = filter.sort === "name" ? asc(resources.title) : filter.sort === "oldest" ? asc(resources.createdAt) : desc(resources.createdAt);
  const rows = await db.select({ id: resources.id, userId: resources.userId, subjectId: resources.subjectId, topicId: resources.topicId, type: resources.type, title: resources.title, url: resources.url, mimeType: resources.mimeType, sizeBytes: resources.sizeBytes, createdAt: resources.createdAt,
    total: sql<number>`count(*) over()` }).from(resources).where(where).orderBy(order, desc(resources.id)).limit(20).offset((filter.page - 1) * 20);
  // An out-of-range page has no window row from which to read the total.
  const total = rows[0]?.total ?? (filter.page === 1 ? 0 : (await db.select({ count: count() }).from(resources).where(where))[0].count);
  return { total: Number(total), rows: rows.map(row => ({ id: row.id, userId: row.userId,
    subjectId: row.subjectId, topicId: row.topicId ?? undefined, type: row.type, title: row.title,
    url: row.url ?? undefined, mimeType: row.mimeType ?? undefined, sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString() })) };
}
