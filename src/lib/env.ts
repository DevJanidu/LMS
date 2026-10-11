import { z } from "zod";

/** Operators can identify invalid settings without logging their values. */
export class InvalidServerConfiguration extends Error {
  constructor(message: string, readonly fields: readonly string[]) {
    super(message);
    this.name = "InvalidServerConfiguration";
  }
}

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().trim().refine(value => {
    if (/[\r\n]/.test(value)) return false;
    const address = value.includes("<") ? /^[^<>]+<([^<>]+)>$/.exec(value)?.[1] : value;
    return z.email().safeParse(address).success;
  }, "Use an email address or Name <email@domain>.").optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CACHE_NAMESPACE: z.enum(["development", "preview", "production", "test"]).default("development"),
  SEED_USER_EMAIL: z.email().optional(),
  SEED_USER_PASSWORD: z.string().min(8).max(128).optional(),
  SEED_USER_NAME: z.string().trim().min(1).optional(),
  SEED_USER_ROLE: z.enum(["learner", "super_admin"]).optional(),
}).superRefine((env, ctx) => {
  if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "Set both email variables to enable delivery; a sender alone is allowed while the API key is pending." });
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "Set both Google OAuth variables or neither." });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

const accountSchema = z.object({
  DATABASE_URL: z.string().url(), AUTH_SECRET: z.string().min(32), APP_URL: z.string().url(),
  RESEND_API_KEY: z.string().optional(), EMAIL_FROM: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(), GOOGLE_CLIENT_SECRET: z.string().optional(),
});
const databaseSchema = accountSchema.pick({ DATABASE_URL: true });
const accountEmailSchema = accountSchema.extend({ RESEND_API_KEY: environmentSchema.shape.RESEND_API_KEY, EMAIL_FROM: environmentSchema.shape.EMAIL_FROM });
const cacheSchema = z.object({
  DATABASE_URL: z.string().url(), UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CACHE_NAMESPACE: z.enum(["development", "preview", "production", "test"]).default("development"),
});
function scopedEnvironment<T extends z.ZodType>(schema: T, input: Record<string, string | undefined>): z.infer<T> {
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => {
    // Dashboard paste often retains dotenv quotes. Normalize URLs/senders only;
    // signing secrets and API tokens must keep their exact configured bytes.
    if (value && (key.endsWith("_URL") || key === "EMAIL_FROM")) {
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
    }
    return [key, value === "" ? undefined : value];
  }));
  normalized.CACHE_NAMESPACE ??= input.VERCEL_ENV;
  const result = schema.safeParse(normalized);
  if (!result.success) throw new InvalidServerConfiguration("Missing or invalid service configuration.", [...new Set(result.error.issues.map(issue => String(issue.path[0] ?? "")))]);
  return result.data;
}
/** Account operations depend on account settings, not storage, cron or CLI settings. */
export function validateAccountEnvironment(input: Record<string, string | undefined>) { return scopedEnvironment(accountSchema, input); }
export function getAccountEnv() { return validateAccountEnvironment(process.env); }
export function getAccountEmailEnv() { return scopedEnvironment(accountEmailSchema, process.env); }
export function getDatabaseEnv() { return scopedEnvironment(databaseSchema, process.env); }
export function getCacheEnv() { return scopedEnvironment(cacheSchema, process.env); }

/** Validate server configuration without including secret values in errors. */
export function validateEnvironment(input: Record<string, string | undefined>): Environment {
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? undefined : value]));
  normalized.CACHE_NAMESPACE ??= input.VERCEL_ENV;
  const result = environmentSchema.safeParse(normalized);
  if (!result.success) {
    throw new InvalidServerConfiguration(`Invalid server configuration: ${result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`, [...new Set(result.error.issues.map(issue => String(issue.path[0] ?? "")))]);
  }
  if (input.NODE_ENV === "production" && (!result.data.UPSTASH_REDIS_REST_URL || !result.data.UPSTASH_REDIS_REST_TOKEN)) throw new InvalidServerConfiguration("Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.", ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter(key => !result.data[key as "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN"]));
  return result.data;
}

let validated: Environment | undefined;
export function getEnv(): Environment {
  return validated ??= validateEnvironment(process.env);
}
