import { describe, expect, it } from "vitest";
import { networkHostAllowed } from "./local-computer";

describe("local computer network policy", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks local or special address %s", (host) => {
    expect(networkHostAllowed(host)).toBe(false);
  });

  it.each(["example.com", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "allows public address %s",
    (host) => {
      expect(networkHostAllowed(host)).toBe(true);
    },
  );
});
