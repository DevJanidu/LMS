import { expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ getEnv: () => ({ OBJECT_STORAGE_ENDPOINT: "https://storage.example.com", OBJECT_STORAGE_REGION: "us-east-2", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture-key", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret" }) }));
import { uploadUrl } from "@/lib/storage";

it("binds uploads to their declared length and type with a short-lived signature", async () => {
  const signed = new URL(await uploadUrl("users/fixture/subjects/fixture/object", "application/pdf", 1024));
  const headers = signed.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
  expect(headers).toContain("content-length");
  expect(headers).toContain("content-type");
  expect(Number(signed.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(300);
});
