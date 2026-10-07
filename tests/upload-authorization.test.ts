import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: { status: "active", role: "learner" } as { status: string; role: string } | undefined, insert: vi.fn(), uploadUrl: vi.fn(), headObject: vi.fn() }));
vi.mock("@/lib/services/workspace", () => ({ ownedSubject: async () => ({}), getSettings: async () => ({ maxFileSizeMB: 10, storagePerUserMB: 100 }) }));
vi.mock("@/lib/storage", () => ({ uploadUrl: mocks.uploadUrl, headObject: mocks.headObject, copyObject: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({
  select: () => ({ from: () => ({ where: async () => [] }) }),
  transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
    select: () => ({ from: () => ({ where: () => ({ for: async () => mocks.actor ? [mocks.actor] : [] }) }) }),
    insert: mocks.insert,
  }),
}) }));
import { requestUpload, confirmUpload } from "@/lib/services/uploads";

beforeEach(() => { vi.clearAllMocks(); });
for (const actor of [undefined, { status: "deactivated", role: "learner" }, { status: "active", role: "super_admin" }]) {
  it(`rejects upload reservation and confirmation for locked actor ${actor?.status ?? "missing"}/${actor?.role ?? "missing"}`, async () => {
    mocks.actor = actor;
    await expect(requestUpload(crypto.randomUUID(), { subjectId: crypto.randomUUID(), title: "PDF", name: "study.pdf", mimeType: "application/pdf", sizeBytes: 100 })).rejects.toThrow("accountInactive");
    await expect(confirmUpload(crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow("accountInactive");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.uploadUrl).not.toHaveBeenCalled();
    expect(mocks.headObject).not.toHaveBeenCalled();
  });
}
