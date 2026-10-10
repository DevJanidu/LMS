import { expect, it, vi } from "vitest";
import { acknowledgeUncertainWrites, beginWrite, subscribeWriteFailures } from "@/lib/workspace/write-status";

it("announces only new failed requests, even while an older uncertainty remains", () => {
  const owner = crypto.randomUUID();
  const notify = vi.fn();
  const unsubscribe = subscribeWriteFailures(owner, notify);
  beginWrite(owner)("saved");
  expect(notify).not.toHaveBeenCalled();
  const uncertain = beginWrite(owner);
  uncertain("uncertain");
  uncertain("uncertain");
  expect(notify).toHaveBeenCalledTimes(1);
  beginWrite(owner)("saved");
  expect(notify).toHaveBeenCalledTimes(1);
  beginWrite(owner)("failed");
  expect(notify).toHaveBeenCalledTimes(2);
  acknowledgeUncertainWrites(owner);
  expect(notify).toHaveBeenCalledTimes(2);
  unsubscribe();
  beginWrite(owner)("failed");
  expect(notify).toHaveBeenCalledTimes(2);
});

it("isolates failure notifications by account", () => {
  const owner = crypto.randomUUID();
  const notify = vi.fn();
  const unsubscribe = subscribeWriteFailures(owner, notify);
  beginWrite(crypto.randomUUID())("uncertain");
  expect(notify).not.toHaveBeenCalled();
  unsubscribe();
});
