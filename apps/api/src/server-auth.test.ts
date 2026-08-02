import { describe, expect, it } from "vitest";

import {
  resolveServerCloudbaseUid,
  trustedProxyEnabled,
} from "./server-auth.js";

describe("standalone server authentication boundary", () => {
  it("keeps trusted proxy identity disabled unless explicitly enabled", () => {
    expect(trustedProxyEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      trustedProxyEnabled({
        AUTH_TRUSTED_PROXY: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      trustedProxyEnabled({
        AUTH_TRUSTED_PROXY: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("rejects a forged identity header when trusted proxy mode is disabled", () => {
    expect(() =>
      resolveServerCloudbaseUid(
        { "x-zkgl-cloudbase-uid": "cloudbase-user-1" },
        {} as NodeJS.ProcessEnv,
      ),
    ).toThrow("Trusted identity proxy is not enabled");
  });

  it("requires a well-formed trusted identity header when proxy mode is enabled", () => {
    expect(() =>
      resolveServerCloudbaseUid(
        {},
        { AUTH_TRUSTED_PROXY: "true" } as NodeJS.ProcessEnv,
      ),
    ).toThrow("Missing trusted identity header");
    expect(() =>
      resolveServerCloudbaseUid(
        { "x-zkgl-cloudbase-uid": "../bad" },
        { AUTH_TRUSTED_PROXY: "true" } as NodeJS.ProcessEnv,
      ),
    ).toThrow("Invalid trusted identity header");
  });

  it("resolves the CloudBase UID injected by the trusted authentication adapter", () => {
    expect(
      resolveServerCloudbaseUid(
        { "x-zkgl-cloudbase-uid": "cloudbase:user_123" },
        { AUTH_TRUSTED_PROXY: "true" } as NodeJS.ProcessEnv,
      ),
    ).toBe("cloudbase:user_123");
  });
});
