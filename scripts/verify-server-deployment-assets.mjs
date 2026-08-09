import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = resolve(import.meta.dirname, "..");

const fail = (message) => {
  throw new Error(`Server deployment asset verification failed: ${message}`);
};

export async function readServerDeploymentAssets(root = defaultRoot) {
  const readText = (path) => readFile(resolve(root, path), "utf8");
  const [
    apiService,
    authAdapterService,
    reminderService,
    reminderTimer,
    exportWorkerService,
    exportWorkerTimer,
    nginxConfig,
    demoNginxConfig,
    demoDeployScript,
    productionDeployScript,
    deploymentDoc,
    finalChecklist,
  ] = await Promise.all([
    readText("deploy/systemd/zkgl-api.service"),
    readText("deploy/systemd/zkgl-auth-adapter.service"),
    readText("deploy/systemd/zkgl-reminder.service"),
    readText("deploy/systemd/zkgl-reminder.timer"),
    readText("deploy/systemd/zkgl-export-worker.service"),
    readText("deploy/systemd/zkgl-export-worker.timer"),
    readText("deploy/nginx/zkgl.conf"),
    readText("deploy/nginx/zkgl-demo-http.conf"),
    readText("scripts/deploy-lighthouse-demo.sh"),
    readText("scripts/deploy-lighthouse-production.sh"),
    readText("docs/deployment.md"),
    readText("docs/final-acceptance-checklist.md"),
  ]);
  return {
    apiService,
    authAdapterService,
    reminderService,
    reminderTimer,
    exportWorkerService,
    exportWorkerTimer,
    nginxConfig,
    demoNginxConfig,
    demoDeployScript,
    productionDeployScript,
    deploymentDoc,
    finalChecklist,
  };
}

const includesAll = (source, fragments, context) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${context} missing ${fragment}`);
  }
};

const dbPasswordPlaceholder = "DB_" + "PASSWORD=";

export function verifyServerDeploymentAssetInputs({
  apiService,
  authAdapterService,
  reminderService,
  reminderTimer,
  exportWorkerService,
  exportWorkerTimer,
  nginxConfig,
  demoNginxConfig,
  demoDeployScript,
  productionDeployScript,
  deploymentDoc,
  finalChecklist,
} = {}) {
  includesAll(
    apiService,
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
    authAdapterService,
    [
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/auth-adapter-cli.js",
      "Restart=always",
      "User=zkgl",
      "After=network.target",
    ],
    "deploy/systemd/zkgl-auth-adapter.service",
  );
  includesAll(
    reminderService,
    [
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/scheduled-reminder-cli.js",
      "Type=oneshot",
      "User=zkgl",
      "After=network.target mysql.service",
    ],
    "deploy/systemd/zkgl-reminder.service",
  );
  includesAll(
    reminderTimer,
    [
      "OnCalendar=*-*-* 08:00:00",
      "Persistent=true",
      "Unit=zkgl-reminder.service",
      "WantedBy=timers.target",
    ],
    "deploy/systemd/zkgl-reminder.timer",
  );
  includesAll(
    exportWorkerService,
    [
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/scheduled-export-cli.js",
      "Type=oneshot",
      "User=zkgl",
      "After=network.target mysql.service",
    ],
    "deploy/systemd/zkgl-export-worker.service",
  );
  includesAll(
    exportWorkerTimer,
    [
      "OnBootSec=1min",
      "OnUnitActiveSec=5min",
      "Persistent=true",
      "Unit=zkgl-export-worker.service",
      "WantedBy=timers.target",
    ],
    "deploy/systemd/zkgl-export-worker.timer",
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
    demoNginxConfig,
    [
      "listen 80 default_server",
      "root /opt/zkgl/current/apps/web/dist",
      "X-Robots-Tag",
      "try_files $uri $uri/ /index.html",
    ],
    "deploy/nginx/zkgl-demo-http.conf",
  );
  if (demoNginxConfig.includes("proxy_pass")) {
    fail("deploy/nginx/zkgl-demo-http.conf must not proxy API traffic");
  }
  includesAll(
    demoDeployScript,
    [
      "ZKGL_DEMO_PUBLIC_URL",
      "https://github.com/xiufengdong169-del/zkgl.git",
      "VITE_DEMO_MODE=true",
      "npm run build -w @zkgl/web",
      "node scripts/verify-web-dist-security.mjs",
      "deploy/nginx/zkgl-demo-http.conf",
      "nginx -t",
      "systemctl reload nginx",
    ],
    "scripts/deploy-lighthouse-demo.sh",
  );
  if (demoDeployScript.includes("AUTH_TRUSTED_PROXY=true")) {
    fail("scripts/deploy-lighthouse-demo.sh must not enable trusted proxy");
  }
  includesAll(
    productionDeployScript,
    [
      "ZKGL_REQUIRE_ENV",
      "https://github.com/xiufengdong169-del/zkgl.git",
      "npm run verify:acceptance",
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/nginx/zkgl.conf",
      "AUTH_TOKEN_VERIFIER_MODULE",
      "AUTH_TRUSTED_PROXY=false",
      "systemctl enable --now zkgl-auth-adapter",
      "systemctl enable --now zkgl-api",
      "curl -fsS http://127.0.0.1:3010/healthz",
      "curl -fsS http://127.0.0.1:3000/healthz",
      "systemctl list-timers 'zkgl-*'",
    ],
    "scripts/deploy-lighthouse-production.sh",
  );
  if (!productionDeployScript.includes(dbPasswordPlaceholder)) {
    fail("scripts/deploy-lighthouse-production.sh must create a DB_PASSWORD placeholder");
  }
  includesAll(
    deploymentDoc,
    [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "deploy/nginx/zkgl-demo-http.conf",
      "scripts/deploy-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-production.sh",
      "node scripts/verify-server-deployment-assets.mjs",
    ],
    "docs/deployment.md",
  );
  includesAll(
    finalChecklist,
    [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "deploy/nginx/zkgl-demo-http.conf",
      "scripts/deploy-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-production.sh",
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
