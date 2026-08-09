import { describe, expect, it, vi } from "vitest";

describe("demo banner", () => {
  it("documents that demo mode uses sample data and the Lighthouse target", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_DEMO_MODE", "true");
    const { demoBannerText, shouldShowDemoBanner } = await import("./demo-banner");

    expect(shouldShowDemoBanner()).toBe(true);
    expect(demoBannerText).toContain("演示模式");
    expect(demoBannerText).toContain("样例数据");
    expect(demoBannerText).toContain("未连接生产 MySQL");
    expect(demoBannerText).toContain("腾讯云轻量应用服务器");
  });

  it("stays hidden outside explicit demo mode", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_DEMO_MODE", "false");
    const { shouldShowDemoBanner } = await import("./demo-banner");

    expect(shouldShowDemoBanner()).toBe(false);
  });
});
