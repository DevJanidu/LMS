import { expect, it } from "vitest";
import { publicAddress } from "@/lib/aven/resource-network";
it("allows public learning hosts while excluding private, mapped, multicast and metadata addresses", () => {
  for (const value of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.1.1",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    expect(publicAddress(value)).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
});
