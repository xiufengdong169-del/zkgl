import { describe, expect, it } from "vitest";

import { buildCloudbaseConfig } from "./cloudbase-config";

describe("CloudBase browser configuration", () => {
  it("向 SDK 传递环境 ID、地域和 Publishable Key", () => {
    expect(
      buildCloudbaseConfig({
        VITE_CLOUDBASE_ENV_ID: " cloudbase-d7gc2b32cd4196059 ",
        VITE_CLOUDBASE_REGION: " ap-guangzhou ",
        VITE_CLOUDBASE_PUBLISHABLE_KEY: " publishable-key ",
      }),
    ).toEqual({
      env: "cloudbase-d7gc2b32cd4196059",
      region: "ap-guangzhou",
      accessKey: "publishable-key",
    });
  });

  it("未配置地域或 Publishable Key 时不传空值", () => {
    expect(
      buildCloudbaseConfig({
        VITE_CLOUDBASE_ENV_ID: "cloudbase-d7gc2b32cd4196059",
        VITE_CLOUDBASE_REGION: " ",
        VITE_CLOUDBASE_PUBLISHABLE_KEY: "",
      }),
    ).toEqual({
      env: "cloudbase-d7gc2b32cd4196059",
    });
  });

  it("缺少环境 ID 时立即失败，避免初始化到错误环境", () => {
    expect(() => buildCloudbaseConfig({})).toThrow(
      "缺少 VITE_CLOUDBASE_ENV_ID",
    );
  });
});
