import { and, eq } from "drizzle-orm";
import { requireLearner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { downloadUrl } from "@/lib/storage";
import { uuidSchema } from "@/lib/validation";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLearner();
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) return new Response(null, { status: 404 });
  const [resource] = await getDb().select({ key: resources.storageKey, title: resources.title, mimeType: resources.mimeType }).from(resources).where(and(eq(resources.id, parsed.data), eq(resources.userId, user.id), eq(resources.type, "file")));
  if (!resource?.key) return new Response(null, { status: 404 });
  return new Response(null, { status: 302, headers: { Location: await downloadUrl(resource.key, resource.title, resource.mimeType), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
