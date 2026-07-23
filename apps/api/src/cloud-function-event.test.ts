import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { normalizeFunctionEvent } from "./cloud-function-event.js";

const cloudFunctionSource = readFileSync(
  new URL("./cloud-function.ts", import.meta.url),
  "utf8",
);

describe("CloudBase function event normalization", () => {
  it("优先使用 HTTP JSON body 中的动作、载荷和请求号，但认证身份必须来自 CloudBase context", () => {
    expect(
      normalizeFunctionEvent(
        {
          action: "raw.action",
          body: JSON.stringify({
            action: "project.detail",
            payload: { projectId: "p-1" },
            requestId: "body-request",
            auth: { uid: "body-uid" },
          }),
          auth: { uid: "raw-uid" },
          requestId: "raw-request",
        },
        { auth: { uid: "context-uid" }, requestId: "context-request" },
      ),
    ).toMatchObject({
      action: "project.detail",
      payload: { projectId: "p-1" },
      requestId: "body-request",
      auth: { uid: "context-uid" },
    });
  });

  it("对象 body 可覆盖原始事件字段，并回退使用 context 请求号", () => {
    expect(
      normalizeFunctionEvent(
        {
          action: "raw.action",
          body: {
            action: "file.download",
            payload: { fileId: "f-1", versionId: null },
          },
        },
        { auth: { uid: "context-uid" }, requestId: "context-request" },
      ),
    ).toMatchObject({
      action: "file.download",
      payload: { fileId: "f-1", versionId: null },
      requestId: "context-request",
      auth: { uid: "context-uid" },
    });
  });

  it("非法 JSON body 不影响原始事件和 context 身份透传", () => {
    expect(
      normalizeFunctionEvent(
        {
          action: "session.get",
          body: "{invalid-json",
          requestId: "raw-request",
        },
        { auth: { uid: "context-uid" }, requestId: "context-request" },
      ),
    ).toMatchObject({
      action: "session.get",
      requestId: "raw-request",
      auth: { uid: "context-uid" },
    });
  });

  it("拒绝请求体伪造认证身份，并在无 context 身份时回退 raw event 身份", () => {
    expect(
      normalizeFunctionEvent({
        body: {
          action: "project.detail",
          payload: { projectId: "p-1" },
          auth: { uid: "spoofed-body-uid" },
        },
        auth: { uid: "trusted-raw-uid" },
      }),
    ).toMatchObject({
      action: "project.detail",
      payload: { projectId: "p-1" },
      auth: { uid: "trusted-raw-uid" },
    });

    expect(
      normalizeFunctionEvent({
        body: {
          action: "project.detail",
          payload: { projectId: "p-1" },
          auth: { uid: "spoofed-body-uid" },
        },
      }),
    ).not.toHaveProperty("auth");
  });

  it("CloudBase 入口向持久层透传归一化后的 requestId", () => {
    expect(cloudFunctionSource).toContain(
      "execute: (action, input, user, requestId)",
    );
    expect(cloudFunctionSource).toContain(
      "executor.execute(action, input, user, requestId)",
    );
  });
});
