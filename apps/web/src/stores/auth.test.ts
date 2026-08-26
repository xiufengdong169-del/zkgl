import type { SessionUser } from "@zkgl/shared";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "./auth";

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  callApi: vi.fn(),
  setLocalAuthTokenOverride: vi.fn(),
  clearLocalAuthTokenOverride: vi.fn(),
  localAuthMode: false,
}));

vi.mock("../cloudbase", () => ({
  getCloudbaseAuth: () => ({
    signInWithPassword: authMocks.signInWithPassword,
    signOut: authMocks.signOut,
  }),
}));

vi.mock("../api", () => ({
  callApi: authMocks.callApi,
  setLocalAuthTokenOverride: authMocks.setLocalAuthTokenOverride,
  clearLocalAuthTokenOverride: authMocks.clearLocalAuthTokenOverride,
  get localAuthMode() {
    return authMocks.localAuthMode;
  },
}));

const user = (): SessionUser => ({
  id: "u-1",
  cloudbaseUid: "cb-u-1",
  employeeId: "e-1",
  departmentId: "d-1",
  enabled: true,
  roleCodes: ["EMPLOYEE"],
  permissionCodes: ["project.read"],
  sensitiveFieldAccess: {},
  dataScopes: [{ type: "SELF", userId: "u-1" }],
});

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.unstubAllEnvs();
    authMocks.signInWithPassword.mockReset();
    authMocks.signOut.mockReset();
    authMocks.callApi.mockReset();
    authMocks.setLocalAuthTokenOverride.mockReset();
    authMocks.clearLocalAuthTokenOverride.mockReset();
    authMocks.localAuthMode = false;
  });

  it("登录成功后加载当前用户并标记已认证", async () => {
    const currentUser = user();
    authMocks.signInWithPassword.mockResolvedValue({ error: null });
    authMocks.callApi.mockResolvedValue(currentUser);

    const auth = useAuthStore();
    await auth.signIn("alice", "secret");

    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      username: "alice",
      password: "secret",
    });
    expect(authMocks.callApi).toHaveBeenCalledWith("session.get");
    expect(auth.loading).toBe(false);
    expect(auth.error).toBeNull();
    expect(auth.authenticated).toBe(true);
    expect(auth.user).toEqual(currentUser);
  });

  it("演示模式下自动使用本地演示管理员且不调用真实登录", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.resetModules();
    const { useAuthStore: useDemoAuthStore } = await import("./auth");
    const auth = useDemoAuthStore();

    await auth.signIn("demo", "demo");

    expect(auth.authenticated).toBe(true);
    expect(auth.user?.id).toBe("demo-admin");
    expect(auth.user?.roleCodes).toEqual(["ADMIN"]);
    expect(auth.user?.permissionCodes).toContain("system.admin");
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(authMocks.callApi).not.toHaveBeenCalled();
  });

  it("本地认证模式跳过 CloudBase 登录并加载业务会话", async () => {
    authMocks.localAuthMode = true;
    const currentUser = user();
    authMocks.callApi.mockResolvedValue(currentUser);

    const auth = useAuthStore();
    await auth.signIn("local-admin", "local-test");

    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(authMocks.callApi).toHaveBeenCalledWith("session.get");
    expect(auth.authenticated).toBe(true);
    expect(auth.user).toEqual(currentUser);
  });

  it("登录失败时清理认证状态并保留错误消息", async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      error: new Error("账号或密码错误"),
    });

    const auth = useAuthStore();
    await expect(auth.signIn("alice", "bad-password")).rejects.toThrow(
      "账号或密码错误",
    );

    expect(authMocks.callApi).not.toHaveBeenCalled();
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(auth.loading).toBe(false);
    expect(auth.authenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(auth.error).toBe("账号或密码错误");
  });

  it("CloudBase 登录成功但业务会话初始化失败时主动退出平台会话", async () => {
    authMocks.signInWithPassword.mockResolvedValue({ error: null });
    authMocks.signOut.mockResolvedValue(undefined);
    authMocks.callApi.mockRejectedValue(new Error("内部账号已停用"));

    const auth = useAuthStore();
    await expect(auth.signIn("alice", "secret")).rejects.toThrow("内部账号已停用");

    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
    expect(auth.loading).toBe(false);
    expect(auth.authenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(auth.error).toBe("内部账号已停用");
  });

  it("已有认证用户时复用本地会话", async () => {
    const currentUser = user();
    const auth = useAuthStore();
    auth.user = currentUser;
    auth.authenticated = true;

    await expect(auth.ensureSession()).resolves.toEqual(currentUser);
    expect(authMocks.callApi).not.toHaveBeenCalled();
  });

  it("没有本地会话且恢复失败时重置状态并提示需要登录", async () => {
    authMocks.callApi.mockRejectedValue(new Error("token expired"));
    const auth = useAuthStore();

    await expect(auth.ensureSession()).rejects.toThrow("需要登录");
    expect(auth.user).toBeNull();
    expect(auth.authenticated).toBe(false);
  });
});
