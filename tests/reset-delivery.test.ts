import { expect, it } from "vitest";
import { recordResetDeliveryFailure, trackResetDelivery } from "@/lib/email/reset-delivery";
import { AccountEmailUnavailable } from "@/lib/email/errors";

it("does not accept a provider acknowledgement that swallowed an email failure", async () => {
  await expect(trackResetDelivery(async () => {
    recordResetDeliveryFailure(new AccountEmailUnavailable());
    return { status: true };
  })).rejects.toThrow(AccountEmailUnavailable);
});
it("isolates concurrent delivery failures and preserves generic unknown-account acknowledgements", async () => {
  const results = await Promise.allSettled([
    trackResetDelivery(async () => { await Promise.resolve(); recordResetDeliveryFailure(new AccountEmailUnavailable()); return { status: true }; }),
    trackResetDelivery(async () => { await Promise.resolve(); return { status: true }; }),
  ]);
  expect(results[0].status).toBe("rejected");
  expect(results[1]).toEqual({ status: "fulfilled", value: { status: true } });
});
