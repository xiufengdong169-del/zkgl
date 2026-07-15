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

describe("frontend API action usage", () => {
  it("前端所有 callApi 动作均使用静态字符串，便于授权和实现一致性校验", () => {
    const dynamicCalls = listSourceFiles(webSourceDir).flatMap(
      (file) => extractFrontendCallApiActions(file).dynamicCalls,
    );

    expect(dynamicCalls).toEqual([]);
  });

  it("前端调用的动作均存在后端定义或明确的 handler 特例", () => {
    const backendActions = extractBackendActionDefinitions();
    const frontendActions = [
      ...new Set(
        listSourceFiles(webSourceDir).flatMap(
          (file) => extractFrontendCallApiActions(file).actions,
        ),
      ),
    ].sort();

    expect(frontendActions.length).toBeGreaterThan(70);
    expect(
      frontendActions.filter(
        (action) =>
          !backendActions.has(action) && !specialHandlerActions.has(action),
      ),
    ).toEqual([]);
  });
});
