import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { getAccountEnv } from "@/lib/env";
import { GoalError } from "./service";
import { z } from "zod";
export const privateJson = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function learnerAccount() {
  const user = await getCurrentUser();
  if (!user) throw new GoalError("authenticationFailed", 401);
  if (user.role !== "learner") throw new GoalError("recordUnavailable", 403);
  return user;
}
export function featureFailure(error: unknown) {
  if (error instanceof z.ZodError)
    return privateJson({ ok: false, error: "invalidInput" }, 400);
  if (
    error instanceof Error &&
    error.constructor.name === "CalendarError" &&
    "status" in error
  ) {
    const code =
      error.message === "planner.conflict"
        ? "conflict"
        : error.message === "accountInactive"
          ? "authenticationFailed"
          : error.message;
    return privateJson({ ok: false, error: code }, Number(error.status));
  }
  if (!(error instanceof GoalError))
    console.warn(
      JSON.stringify({
        event: "goals_aven_request_failed",
        category: error instanceof Error ? error.name : "unknown",
      }),
    );
  return privateJson(
    {
      ok: false,
      error: error instanceof GoalError ? error.message : "serviceUnavailable",
    },
    error instanceof GoalError ? error.status : 503,
  );
}
export async function validatedBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  if (request.headers.get("origin") !== new URL(getAccountEnv().APP_URL).origin)
    throw new GoalError("invalidInput", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 131072)
    throw new GoalError("invalidInput", 413);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = "",
    bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 131072) {
          await reader.cancel();
          throw new GoalError("invalidInput", 413);
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new GoalError("invalidInput");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new GoalError("invalidInput");
  return result.data;
}
