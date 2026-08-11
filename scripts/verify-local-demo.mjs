import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyPublicDemo } from "./verify-public-demo.mjs";
import { verifyWebDistSecurity } from "./verify-web-dist-security.mjs";

const root = resolve(import.meta.dirname, "..");
export const defaultOutDir = resolve(root, ".tmp", "zkgl-local-demo");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
]);

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function outDirForVite(outDir) {
  return normalize(resolve(outDir)).replaceAll("\\", "/");
}

export function localDemoBuildCommand({ outDir = defaultOutDir } = {}) {
  return {
    command: npmCommand(),
    args: [
      "run",
      "build",
      "-w",
      "@zkgl/web",
      "--",
      "--outDir",
      outDirForVite(outDir),
      "--emptyOutDir",
    ],
    env: {
      ...process.env,
      VITE_DEMO_MODE: "true",
      VITE_API_BASE_URL: "",
    },
  };
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

export async function buildLocalDemoBundle({
  outDir = defaultOutDir,
  runner = runCommand,
} = {}) {
  await rm(outDir, { recursive: true, force: true });
  const build = localDemoBuildCommand({ outDir });
  await runner(build.command, build.args, { env: build.env, cwd: root });
  return outDir;
}

function safeResolveRequestPath(dist, requestUrl = "/") {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const requested = resolve(dist, `.${pathname}`);
  const normalizedDist = resolve(dist);
  if (requested !== normalizedDist && !requested.startsWith(normalizedDist + sep)) {
    return join(normalizedDist, "index.html");
  }
  return requested;
}

export function createDemoStaticServer({ dist = defaultOutDir } = {}) {
  const normalizedDist = resolve(dist);
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let file = safeResolveRequestPath(normalizedDist, request.url);
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(normalizedDist, "index.html");
    }

    if (!existsSync(file)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const contentType =
      mimeTypes.get(extname(file).toLowerCase()) ||
      "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(await readFile(file));
  });
}

async function listen(server) {
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Local demo server did not expose a TCP port");
  }
  return `http://127.0.0.1:${address.port}/`;
}

async function close(server) {
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
}

async function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRelativeFiles(rootDir, absolute)));
    } else if (entry.isFile()) {
      files.push(relative(rootDir, absolute).replaceAll("\\", "/"));
    }
  }
  return files;
}

export async function collectLocalDemoAssetRoutes({ dist = defaultOutDir } = {}) {
  const normalizedDist = resolve(dist);
  return (await collectRelativeFiles(normalizedDist))
    .map((file) => `/${file}`)
    .sort();
}

export async function verifyLocalDemoAssets({
  baseUrl,
  dist = defaultOutDir,
  fetchImpl = fetch,
} = {}) {
  if (!baseUrl) throw new Error("Local demo asset verification requires baseUrl");
  const routes = await collectLocalDemoAssetRoutes({ dist });
  if (!routes.length) throw new Error("Local demo asset verification found no files");
  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Local demo asset ${route} returned HTTP ${response.status}`);
    }
    const content = await response.arrayBuffer();
    if (content.byteLength === 0) {
      throw new Error(`Local demo asset ${route} is empty`);
    }
  }
  return `Local demo assets verified: ${routes.length} files`;
}

export async function verifyLocalDemo({
  outDir = defaultOutDir,
  buildDemo = buildLocalDemoBundle,
  verifyDist = verifyWebDistSecurity,
  verifyDemo = verifyPublicDemo,
  verifyAssets = verifyLocalDemoAssets,
} = {}) {
  await buildDemo({ outDir });
  await verifyDist({ dist: outDir });

  const server = createDemoStaticServer({ dist: outDir });
  const baseUrl = await listen(server);
  try {
    await verifyDemo({ baseUrl });
    await verifyAssets({ baseUrl, dist: outDir });
  } finally {
    await close(server);
  }
  return `Local demo verified: ${baseUrl}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyLocalDemo());
}
