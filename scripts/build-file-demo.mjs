import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, ".tmp", "zkgl-file-demo");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function vitePath(value) {
  return value.replaceAll("\\", "/");
}

async function run(command, args, options = {}) {
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

await rm(outDir, { recursive: true, force: true });

await run(
  npmCommand(),
  [
    "run",
    "build",
    "-w",
    "@zkgl/web",
    "--",
    "--outDir",
    vitePath(outDir),
    "--emptyOutDir",
  ],
  {
    env: {
      ...process.env,
      VITE_DEMO_MODE: "true",
      VITE_FILE_DEMO_MODE: "true",
      VITE_API_BASE_URL: "",
    },
  },
);

const indexUrl = pathToFileURL(resolve(outDir, "index.html")).toString();
console.log("");
console.log("File demo built successfully.");
console.log(`Open: ${indexUrl}#/demo`);
console.log(`Folder: ${outDir}`);
