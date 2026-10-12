import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/aven/access", () => ({
  assertResourceAccess: vi.fn().mockResolvedValue(undefined),
}));
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  reserve: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ readObjectContent: mocks.read }));
vi.mock("@/lib/aven/usage", () => ({
  reserveUsage: mocks.reserve,
  finishUsage: mocks.finish,
}));
vi.mock("@/lib/aven/config", () => ({
  avenConfig: () => ({ key: "fixture-key", model: "fixture-model" }),
  MAX_OUTPUT_TOKENS: 4096,
}));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {},
}));
import { processPdf } from "@/lib/aven/documents";
const resource = {
  id: "resource",
  title: "Learning notes",
  storageKey: "owned-resource.pdf",
  sizeBytes: 100,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(Buffer.from("%PDF-fixture"));
  mocks.reserve.mockResolvedValue({ id: "reservation" });
  mocks.finish.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("returns a processed PDF summary and settles actual token usage", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ input_tokens: 32 }))
      .mockResolvedValueOnce(
        Response.json({
          status: "completed",
          usage: { input_tokens: 32, output_tokens: 14 },
          output: [{ content: [{ text: "Study these concepts." }] }],
        }),
      ),
  );
  expect(await processPdf("owner", resource)).toMatchObject({
    contentsRead: true,
    untrustedContent: "Study these concepts.",
  });
  expect(mocks.reserve).toHaveBeenCalledWith(
    "owner",
    expect.any(String),
    false,
    0,
    32,
  );
  expect(mocks.finish).toHaveBeenCalledWith("reservation", 32, 14, false);
});
it("releases unused PDF reservations when the provider rejects credentials", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ input_tokens: 32 }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }),
      ),
  );
  await expect(processPdf("owner", resource)).rejects.toThrow("aiKeyInvalid");
  expect(mocks.finish).toHaveBeenCalledWith("reservation", 0, 0, false, false);
});
it("retains a reservation for uncertain PDF provider failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ input_tokens: 32 }))
      .mockRejectedValueOnce(new Error("connection failed")),
  );
  await expect(processPdf("owner", resource)).rejects.toThrow(
    "connection failed",
  );
  expect(mocks.finish).toHaveBeenCalledWith("reservation", 0, 0, false, true);
});
it("does not reserve paid usage when the token-count endpoint rejects the key", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }),
      ),
  );
  await expect(processPdf("owner", resource)).rejects.toThrow("aiKeyInvalid");
  expect(mocks.reserve).not.toHaveBeenCalled();
});
