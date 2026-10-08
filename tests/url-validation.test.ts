import { expect, it } from "vitest";
import { urlSchema } from "@/lib/validation";
import { operationsSchema } from "@/lib/validation/operations";
it("rejects malformed and unsafe URLs as validation results without throwing", () => {
  for (const value of ["not a URL", "https://", "http://[invalid", "javascript:alert(1)", "data:text/html,<script>1</script>", "file:///private"]) {
    expect(() => urlSchema.safeParse(value)).not.toThrow();
    expect(urlSchema.safeParse(value).success).toBe(false);
    expect(() => operationsSchema.safeParse([{ kind: "resource", value: { id: crypto.randomUUID(), subjectId: crypto.randomUUID(), title: "Link", type: "link", url: value } }])).not.toThrow();
  }
  expect(urlSchema.safeParse("https://example.com/study?q=a%20b").success).toBe(true);
});
