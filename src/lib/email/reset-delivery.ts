import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const delivery = new AsyncLocalStorage<{ failure?: unknown; failed?: boolean }>();
export function recordResetDeliveryFailure(error: unknown) {
  const state = delivery.getStore();
  if (state) { state.failure = error; state.failed = true; }
}
/** Better Auth logs and swallows callback failures; preserve them per request. */
export async function trackResetDelivery<T>(request: () => Promise<T>): Promise<T> {
  return delivery.run({}, async () => {
    const result = await request();
    const state = delivery.getStore();
    if (state?.failed) throw state.failure;
    return result;
  });
}
