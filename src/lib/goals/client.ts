import type { GoalDetail } from "./model";
import type { GoalMutation } from "./validation";
export class FeatureRequestError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function featureRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok || value.ok === false)
    throw new FeatureRequestError(
      value.error ?? "serviceUnavailable",
      response.status,
    );
  return value as T;
}
export const saveGoal = (input: GoalMutation) =>
  featureRequest<{ detail?: GoalDetail; deleted: boolean; version: number }>(
    "/api/goals",
    input,
  );
