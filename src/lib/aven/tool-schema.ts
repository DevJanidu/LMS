import { z } from "zod";
/** JSON schema for a strict OpenAI function definition, without keys strict mode rejects. */
export function strictSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema, { io: "output" });
  const clean = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(clean);
      return;
    }
    const object = node as Record<string, unknown>;
    delete object.$schema;
    delete object.default;
    Object.values(object).forEach(clean);
  };
  clean(value);
  return value;
}
