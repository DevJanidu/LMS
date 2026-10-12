/** Next.js rejects unknown references before executing the action. */
export function isUnrecognizedServerAction(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; message?: unknown };
  return (
    value.name === "UnrecognizedActionError" ||
    (typeof value.message === "string" &&
      /^(?:Server Action "[^"]+" was not found on the server\.|Failed to find Server Action(?:\s|\.|$))/.test(
        value.message,
      ))
  );
}

export const SERVER_ACTION_UPDATE_EVENT = "acadence:server-action-update";
export class AppUpdatedError extends Error {
  constructor() {
    super("appUpdatedDescription");
    this.name = "AppUpdatedError";
  }
}

/** Keep drafts in place; a user-triggered hard refresh fetches fresh references. */
export async function runServerAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!isUnrecognizedServerAction(error)) throw error;
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(SERVER_ACTION_UPDATE_EVENT));
    throw new AppUpdatedError();
  }
}
