import { z } from "zod";

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

/** Validate server configuration without including secret values in errors. */
export function validateEnvironment(input: Record<string, string | undefined>): Environment {
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? undefined : value]));
  normalized.CACHE_NAMESPACE ??= input.VERCEL_ENV;
  const result = environmentSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(`Invalid server configuration: ${result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  if (input.NODE_ENV === "production" && (!result.data.UPSTASH_REDIS_REST_URL || !result.data.UPSTASH_REDIS_REST_TOKEN)) throw new Error("Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  return result.data;
}

let validated: Environment | undefined;
export function getEnv(): Environment {
  return validated ??= validateEnvironment(process.env);
}
