import type * as actions from "@/app/[locale]/actions";

const reads = new Map<string, Promise<unknown>>();
let generation = 0;
/** A post-mutation read must never join a request started before the write. */
export function invalidateWorkspaceReads() { generation++; reads.clear(); }
/** Deduplicate simultaneous identical reads; never cache authenticated data across users. */
async function query<T>(kind: string, input: unknown, owner: string): Promise<T> {
  const key = `${owner}:${generation}:${kind}:${JSON.stringify(input)}`;
  let request = reads.get(key);
  if (!request) {
    request = fetch(`/api/workspace/query?kind=${kind}&input=${encodeURIComponent(JSON.stringify(input))}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(async response => {
      const result = await response.json();
      // Typed read failures are returned to forms/lists for localized feedback.
      // Search has an unwrapped payload, so failures must reject that contract.
      if (!response.ok && kind === "search") throw new Error(result.error ?? "saveFailed");
      if (!response.ok && result.ok !== false) throw new Error("saveFailed");
      return result;
    }).finally(() => { if (reads.get(key) === request) reads.delete(key); });
    reads.set(key, request);
  }
  return request as Promise<T>;
}
type Scoped<F extends (input: unknown) => Promise<unknown>> = (input: Parameters<F>[0], owner: string) => ReturnType<F>;
export const querySessions: Scoped<typeof actions.querySessions> = (input, owner) => query("sessions", input, owner);
export const queryResources: Scoped<typeof actions.queryResources> = (input, owner) => query("resources", input, owner);
export const queryAdminUsers: Scoped<typeof actions.queryAdminUsers> = (input, owner) => query("users", input, owner);
export const queryBlocks: Scoped<typeof actions.queryBlocks> = (input, owner) => query("blocks", input, owner);
export const resourceDetail: Scoped<typeof actions.resourceDetail> = (input, owner) => query("resource", input, owner);
export const searchWorkspace: Scoped<typeof actions.searchWorkspace> = (input, owner) => query("search", input, owner);
