import { afterEach, expect, it, vi } from "vitest";
import {
  AppUpdatedError,
  isUnrecognizedServerAction,
  runServerAction,
  SERVER_ACTION_UPDATE_EVENT,
} from "@/lib/client/server-actions";
afterEach(() => vi.unstubAllGlobals());
it("identifies missing Next.js action references without classifying ordinary failures or redirects", () => {
  expect(
    isUnrecognizedServerAction(
      Object.assign(new Error("missing"), { name: "UnrecognizedActionError" }),
    ),
  ).toBe(true);
  expect(
    isUnrecognizedServerAction(
      new Error('Server Action "abc" was not found on the server.'),
    ),
  ).toBe(true);
  expect(
    isUnrecognizedServerAction(
      new Error(
        'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
      ),
    ),
  ).toBe(true);
  expect(isUnrecognizedServerAction(new Error("Network error"))).toBe(false);
  expect(
    isUnrecognizedServerAction({ digest: "NEXT_REDIRECT;replace;/login;307;" }),
  ).toBe(false);
  expect(isUnrecognizedServerAction(null)).toBe(false);
});
it("notifies the refresh UI and never replays a missing action", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  const action = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error("missing"), { name: "UnrecognizedActionError" }),
    );
  await expect(runServerAction(action)).rejects.toBeInstanceOf(AppUpdatedError);
  expect(action).toHaveBeenCalledTimes(1);
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
  expect(dispatchEvent.mock.calls[0][0].type).toBe(SERVER_ACTION_UPDATE_EVENT);
});
it("preserves successful results and rethrows unrelated errors unchanged", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  const result = { ok: true };
  expect(await runServerAction(async () => result)).toBe(result);
  const redirect = { digest: "NEXT_REDIRECT;replace;/login;307;" };
  await expect(
    runServerAction(async () => {
      throw redirect;
    }),
  ).rejects.toBe(redirect);
  const failure = new Error("saveFailed");
  await expect(
    runServerAction(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(dispatchEvent).not.toHaveBeenCalled();
});
