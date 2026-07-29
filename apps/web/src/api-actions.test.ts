import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const webSourceDir = fileURLToPath(new URL(".", import.meta.url));
const backendActionsSource = readFileSync(
  new URL("../../api/src/actions.ts", import.meta.url),
  "utf8",
);
const specialHandlerActions = new Set(["session.get"]);
const backendCompatibilityActions = new Set([
  // Older generic approval task endpoint kept for compatibility; the UI uses
  // approval.inbox.list to separate pending, initiated, copied and processed work.
  "approval.task.list",
]);

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (entry.name.endsWith(".test.ts")) return [];
    return [".ts", ".vue"].includes(extname(entry.name)) ? [fullPath] : [];
  });
}

function scriptSource(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  if (!filePath.endsWith(".vue")) return source;
  return [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1] ?? "")
    .join("\n");
}

function extractFrontendCallApiActions(filePath: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    scriptSource(filePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const actions: string[] = [];
  const dynamicCalls: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "callApi") {
        const action = node.arguments[0];
        if (action && ts.isStringLiteral(action)) actions.push(action.text);
        else dynamicCalls.push(filePath);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { actions, dynamicCalls };
}

function extractBackendActionDefinitions() {
  return new Set(
    [...backendActionsSource.matchAll(/"([^"]+)"\s*:/g)]
      .map((match) => match[1]!)
      .filter((action) => action.includes(".")),
  );
}

function extractAllFrontendActions() {
  return [
    ...new Set(
      listSourceFiles(webSourceDir).flatMap(
        (file) => extractFrontendCallApiActions(file).actions,
      ),
    ),
  ].sort();
}

function extractFrontendCallApiPayloadProperties(
  filePath: string,
  guardedActions: Set<string>,
) {
  const source = scriptSource(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const calls: Array<{
    filePath: string;
    action: string;
    properties: Map<string, string>;
  }> = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "callApi"
    ) {
      const action = node.arguments[0];
      const payload = node.arguments[1];
      if (
        action &&
        ts.isStringLiteral(action) &&
        guardedActions.has(action.text)
      ) {
        const properties = new Map<string, string>();
        if (payload && ts.isObjectLiteralExpression(payload)) {
          for (const property of payload.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name)
            ) {
              properties.set(
                property.name.text,
                property.initializer.getText(sourceFile),
              );
            }
          }
        }
        calls.push({ filePath, action: action.text, properties });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return calls;
}

function extractFrontendPageSizes(filePath: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    scriptSource(filePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const pageSizes: Array<{ filePath: string; value: number }> = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "pageSize" &&
      ts.isNumericLiteral(node.initializer)
    )
      pageSizes.push({ filePath, value: Number(node.initializer.text) });
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return pageSizes;
}

describe("frontend API action usage", () => {
  it("前端所有 callApi 动作均使用静态字符串，便于授权和实现一致性校验", () => {
    const dynamicCalls = listSourceFiles(webSourceDir).flatMap(
      (file) => extractFrontendCallApiActions(file).dynamicCalls,
    );

    expect(dynamicCalls).toEqual([]);
  });

  it("前端调用的动作均存在后端定义或明确的 handler 特例", () => {
    const backendActions = extractBackendActionDefinitions();
    const frontendActions = extractAllFrontendActions();

    expect(frontendActions.length).toBeGreaterThan(70);
    expect(
      frontendActions.filter(
        (action) =>
          !backendActions.has(action) && !specialHandlerActions.has(action),
      ),
    ).toEqual([]);
  });

  it("后端业务动作均有前端入口或明确兼容例外", () => {
    const frontendActions = new Set(extractAllFrontendActions());
    const missingFrontendEntry = [...extractBackendActionDefinitions()]
      .filter((action) => !backendCompatibilityActions.has(action))
      .filter((action) => !frontendActions.has(action))
      .sort();

    expect(missingFrontendEntry).toEqual([]);
  });
  it("前端分页大小与后端通用分页白名单保持一致", () => {
    const invalidPageSizes = listSourceFiles(webSourceDir)
      .flatMap((file) => extractFrontendPageSizes(file))
      .filter((item) => ![20, 50].includes(item.value))
      .map((item) => `${item.filePath}:${item.value}`);

    expect(invalidPageSizes).toEqual([]);
  });

  it("合作方结算付款申请使用非空账户占位并由后端覆盖档案账户", () => {
    const settlementsView = readFileSync(
      join(webSourceDir, "views", "SettlementsView.vue"),
      "utf8",
    );

    expect(settlementsView).toContain('sourceType: "PARTNER_SETTLEMENT"');
    expect(settlementsView).toContain(
      'receivingAccount: "由合作方档案带入"',
    );
  });

  it("带遗留事项结项支持登记未付款类型", () => {
    const settlementsView = readFileSync(
      join(webSourceDir, "views", "SettlementsView.vue"),
      "utf8",
    );

    expect(settlementsView).toContain('<option value="PAYABLE">未付款</option>');
  });

  it("日常采购关联合同时只展示有效支出合同", () => {
    const financeView = readFileSync(
      join(webSourceDir, "views", "FinanceView.vue"),
      "utf8",
    );

    expect(financeView).toContain("x.contractType === 'EXPENSE'");
    expect(financeView).toContain("x.amountStatus === 'CONFIRMED'");
    expect(financeView).toContain(
      "['PENDING_SIGNATURE', 'PERFORMING', 'COMPLETED'].includes",
    );
  });
  it("keeps audit outcome filter options aligned with persisted backend values", () => {
    const adminView = readFileSync(
      join(webSourceDir, "views", "AdminView.vue"),
      "utf8",
    );

    expect(adminView).toContain('<option value="SUCCESS">');
    expect(adminView).toContain('<option value="DENIED">');
    expect(adminView).toContain('<option value="FAILED">');
    expect(adminView).not.toContain('<option value="FAILURE">');
  });

  it("keeps project exports on the background file download path", () => {
    const homeView = readFileSync(
      join(webSourceDir, "views", "HomeView.vue"),
      "utf8",
    );

    expect(homeView).toContain('"report.project.export"');
    expect(homeView).toContain('"file.download"');
    expect(homeView).toContain("openTrustedDownloadUrl");
    expect(homeView).not.toContain('mode: "SYNCHRONOUS"');
    expect(homeView).not.toContain("URL.createObjectURL");
    expect(homeView).not.toContain("new Blob");
    expect(homeView).not.toContain("buildCsv");
  });

  it("disables expired background export downloads in the dashboard", () => {
    const homeView = readFileSync(
      join(webSourceDir, "views", "HomeView.vue"),
      "utf8",
    );

    expect(homeView).toContain("isExpired");
    expect(homeView).toContain("Boolean(task.isExpired)");
    expect(homeView).toContain("&#23548;&#20986;&#25991;&#20214;&#24050;&#36807;&#26399;");
    expect(homeView).toContain("!task.fileId || task.isExpired");
  });

  it("maps background export failure codes before rendering dashboard errors", () => {
    const homeView = readFileSync(
      join(webSourceDir, "views", "HomeView.vue"),
      "utf8",
    );

    expect(homeView).toContain("exportFailureText(task.failureReason)");
    expect(homeView).toContain("EXPORT_PERMISSION_SNAPSHOT_INVALID");
    expect(homeView).toContain("EXPORT_TASK_PROCESS_FAILED");
    expect(homeView).not.toContain("{{ task.failureReason }}");
  });

  it("requires frontend idempotency keys for approval and payment mutation actions", () => {
    const requiredKeysByAction = new Map([
      ["approval.instance.submit", "actionKey"],
      ["approval.task.action", "actionKey"],
      ["approval.instance.withdraw", "actionKey"],
      ["payment.detail.create", "idempotencyKey"],
      ["deposit.event.create", "idempotencyKey"],
    ]);
    const calls = listSourceFiles(webSourceDir).flatMap((file) =>
      extractFrontendCallApiPayloadProperties(
        file,
        new Set(requiredKeysByAction.keys()),
      ),
    );

    expect(calls.length).toBeGreaterThan(15);
    expect(
      calls
        .filter(({ action, properties }) => {
          const key = requiredKeysByAction.get(action)!;
          return properties.get(key) !== "crypto.randomUUID()";
        })
        .map(({ filePath, action }) => `${filePath}:${action}`),
    ).toEqual([]);
  });
});
