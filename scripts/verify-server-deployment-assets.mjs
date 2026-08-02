import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Server deployment asset verification failed: ${message}`);
};

export async function readServerDeploymentAssets(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [systemdService, nginxConfig, deploymentDoc, finalChecklist] =
    await Promise.all([
      readText("deploy/systemd/zkgl-api.service"),
      readText("deploy/nginx/zkgl.conf"),
      readText("docs/deployment.md"),
      readText("docs/final-acceptance-checklist.md"),
    ]);
  return { systemdService, nginxConfig, deploymentDoc, finalChecklist };
}

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

export function verifyServerDeploymentAssetInputs({
  systemdService,
  nginxConfig,
  deploymentDoc,
  finalChecklist,
} = {}) {
  includesAll(
    systemdService,
    [
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/npm run start -w @zkgl/api",
      "Restart=always",
      "User=zkgl",
      "After=network.target mysql.service",
    ],
    "deploy/systemd/zkgl-api.service",
  );
  includesAll(
    nginxConfig,
    [
      "listen 443 ssl http2",
      "root /opt/zkgl/current/apps/web/dist",
      "auth_request /_zkgl_auth",
      "proxy_pass http://127.0.0.1:3010/verify",
      "proxy_set_header Authorization $http_authorization",
      "proxy_set_header X-ZKGL-CloudBase-UID \"\"",
      "auth_request_set $zkgl_cloudbase_uid",
      "proxy_set_header X-ZKGL-CloudBase-UID $zkgl_cloudbase_uid",
      "proxy_pass http://127.0.0.1:3000/api",
      "proxy_set_header Authorization \"\"",
      "try_files $uri $uri/ /index.html",
    ],
    "deploy/nginx/zkgl.conf",
  );
  includesAll(
    deploymentDoc,
    [
      "deploy/systemd/zkgl-api.service",
      "deploy/nginx/zkgl.conf",
      "node scripts/verify-server-deployment-assets.mjs",
    ],
    "docs/deployment.md",
  );
  includesAll(
    finalChecklist,
    [
      "deploy/systemd/zkgl-api.service",
      "deploy/nginx/zkgl.conf",
      "node scripts/verify-server-deployment-assets.mjs",
    ],
    "docs/final-acceptance-checklist.md",
  );
  return "Server deployment assets verified";
}

export async function verifyServerDeploymentAssets({ root = defaultRoot } = {}) {
  return verifyServerDeploymentAssetInputs(
    await readServerDeploymentAssets(root),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await verifyServerDeploymentAssets());
}
