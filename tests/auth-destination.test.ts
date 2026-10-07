import { expect, it } from "vitest";
import { loginDestination } from "@/lib/auth/destination";
it("chooses the role and onboarding destination before a return path", () => {
  expect(loginDestination("super_admin", false, "/subjects")).toBe("/admin");
  expect(loginDestination("learner", false, "/dashboard")).toBe("/onboarding");
  expect(loginDestination("learner", true, "/subjects/123?tab=resources")).toBe("/subjects/123?tab=resources");
});
it("rejects external, admin and malformed return paths", () => {
  for (const path of ["https://example.com", "//example.com", "/admin", "/login", "/subjects\\evil", "/subjects\n", "/dashboardevil"]) expect(loginDestination("learner", true, path)).toBe("/dashboard");
});
