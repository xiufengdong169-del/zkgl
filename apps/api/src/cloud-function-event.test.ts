import { describe, expect, it } from "vitest";

import { normalizeFunctionEvent } from "./cloud-function-event.js";

describe("CloudBase function event normalization", () => {
  it("优先使用 HTTP JSON body 中的动作、载荷、请求号和认证身份", () => {
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
      auth: { uid: "body-uid" },
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
});
