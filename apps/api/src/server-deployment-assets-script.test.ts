import { describe, expect, it } from "vitest";

type ServerDeploymentAssetsModule = {
  verifyServerDeploymentAssetInputs(inputs: {
    apiService: string;
    authAdapterService: string;
    reminderService: string;
    reminderTimer: string;
    exportWorkerService: string;
    exportWorkerTimer: string;
    nginxConfig: string;
    demoNginxConfig: string;
    demoBootstrapScript: string;
    demoDeployScript: string;
    productionDeployScript: string;
    serverEnvVerifier: string;
    verifierTemplate: string;
    gitAttributes: string;
    deploymentDoc: string;
    finalChecklist: string;
  }): string;
};

async function loadServerDeploymentAssetsModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-server-deployment-assets.mjs")) as ServerDeploymentAssetsModule;
}

function validInputs() {
  return {
    apiService: [
      "After=network.target mysql.service",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/npm run start -w @zkgl/api",
      "Restart=always",
      "User=zkgl",
    ].join("\n"),
    authAdapterService: [
      "After=network.target",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/auth-adapter-cli.js",
      "Restart=always",
      "User=zkgl",
    ].join("\n"),
    reminderService: [
      "After=network.target mysql.service",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/scheduled-reminder-cli.js",
      "Type=oneshot",
      "User=zkgl",
    ].join("\n"),
    reminderTimer: [
      "OnCalendar=*-*-* 08:00:00",
      "Persistent=true",
      "Unit=zkgl-reminder.service",
      "WantedBy=timers.target",
    ].join("\n"),
    exportWorkerService: [
      "After=network.target mysql.service",
      "WorkingDirectory=/opt/zkgl/current",
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "ExecStart=/usr/bin/node apps/api/dist/scheduled-export-cli.js",
      "Type=oneshot",
      "User=zkgl",
    ].join("\n"),
    exportWorkerTimer: [
      "OnBootSec=1min",
      "OnUnitActiveSec=5min",
      "Persistent=true",
      "Unit=zkgl-export-worker.service",
      "WantedBy=timers.target",
    ].join("\n"),
    nginxConfig: [
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
    ].join("\n"),
    demoNginxConfig: [
      "listen 80 default_server",
      "root /opt/zkgl/current/apps/web/dist",
      "X-Robots-Tag",
      "try_files $uri $uri/ /index.html",
    ].join("\n"),
    demoBootstrapScript: [
      "https://github.com/xiufengdong169-del/zkgl.git",
      "git clone --branch",
      "git -C",
      "scripts/deploy-lighthouse-demo.sh",
      "sudo bash",
    ].join("\n"),
    demoDeployScript: [
      "ZKGL_DEMO_PUBLIC_URL",
      "https://github.com/xiufengdong169-del/zkgl.git",
      "VITE_DEMO_MODE=true",
      "npm run build -w @zkgl/web",
      "node scripts/verify-web-dist-security.mjs",
      "deploy/nginx/zkgl-demo-http.conf",
      "nginx -t",
      "systemctl reload nginx",
    ].join("\n"),
    productionDeployScript: [
      "ZKGL_REQUIRE_ENV",
      "ZKGL_API_BASE_URL",
      "ZKGL_TLS_CERT",
      "ZKGL_TLS_KEY",
      "https://github.com/xiufengdong169-del/zkgl.git",
      "npm run verify:acceptance",
      "node scripts/verify-server-env.mjs",
      "VITE_API_BASE_URL",
      "VITE_CLOUDBASE_ENV_ID",
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/nginx/zkgl.conf",
      "AUTH_TOKEN_VERIFIER_MODULE",
      "AUTH_TRUSTED_PROXY=false",
      "DB_" + "PASSWORD=",
      "systemctl enable --now zkgl-auth-adapter",
      "systemctl enable --now zkgl-api",
      "curl -fsS http://127.0.0.1:3010/healthz",
      "curl -fsS http://127.0.0.1:3000/healthz",
      "curl -fsS http://127.0.0.1:3000/readyz",
      "systemctl list-timers 'zkgl-*'",
      "ssl_certificate ${ZKGL_TLS_CERT}",
      "ssl_certificate_key ${ZKGL_TLS_KEY}",
    ].join("\n"),
    serverEnvVerifier: [
      "AUTH_TOKEN_VERIFIER_MODULE does not exist",
      "AUTH_TOKEN_VERIFIER_MODULE must not point to an example verifier",
      "API_ALLOWED_ORIGINS still contains a placeholder",
      "TLS certificate files are missing",
      "AUTH_TRUSTED_PROXY must be true",
    ].join("\n"),
    verifierTemplate: [
      "export async function verifyAccessToken",
      "fail",
      "server-local verifier",
    ].join("\n"),
    gitAttributes: [
      "*.sh text eol=lf",
      "*.service text eol=lf",
      "*.timer text eol=lf",
      "*.conf text eol=lf",
    ].join("\n"),
    deploymentDoc: [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "deploy/nginx/zkgl-demo-http.conf",
      "scripts/bootstrap-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-production.sh",
      "scripts/verify-server-env.mjs",
      "deploy/auth/cloudbase-token-verifier.example.mjs",
      "node scripts/verify-server-deployment-assets.mjs",
      "curl http://127.0.0.1:3000/readyz",
    ].join("\n"),
    finalChecklist: [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-auth-adapter.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "deploy/nginx/zkgl-demo-http.conf",
      "scripts/bootstrap-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-demo.sh",
      "scripts/deploy-lighthouse-production.sh",
      "scripts/verify-server-env.mjs",
      "deploy/auth/cloudbase-token-verifier.example.mjs",
      "node scripts/verify-server-deployment-assets.mjs",
      "curl http://127.0.0.1:3000/readyz",
    ].join("\n"),
  };
}

describe("server deployment asset verifier script", () => {
  it("accepts aligned systemd, Nginx, and documentation assets", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();

    expect(verifyServerDeploymentAssetInputs(validInputs())).toBe(
      "Server deployment assets verified",
    );
  });

  it("rejects Nginx drift that would trust a browser-supplied identity header", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.nginxConfig = inputs.nginxConfig.replace(
      "proxy_set_header X-ZKGL-CloudBase-UID \"\"",
      "proxy_set_header X-ZKGL-CloudBase-UID $http_x_zkgl_cloudbase_uid",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/nginx/zkgl.conf missing proxy_set_header X-ZKGL-CloudBase-UID \"\"",
    );
  });

  it("rejects a systemd service that does not load the server-only environment file", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.apiService = inputs.apiService.replace(
      "EnvironmentFile=/etc/zkgl/zkgl-api.env",
      "EnvironmentFile=.env",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/systemd/zkgl-api.service missing EnvironmentFile=/etc/zkgl/zkgl-api.env",
    );
  });

  it("rejects an auth adapter service that does not run the verifier boundary", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.authAdapterService = inputs.authAdapterService.replace(
      "ExecStart=/usr/bin/node apps/api/dist/auth-adapter-cli.js",
      "ExecStart=/usr/bin/node apps/api/dist/server.js",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/systemd/zkgl-auth-adapter.service missing ExecStart=/usr/bin/node apps/api/dist/auth-adapter-cli.js",
    );
  });

  it("rejects a demo HTTP site that proxies API traffic", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.demoNginxConfig += "\nproxy_pass http://127.0.0.1:3000/api";

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/nginx/zkgl-demo-http.conf must not proxy API traffic",
    );
  });

  it("rejects a demo bootstrap script that does not delegate to the verified deploy script", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.demoBootstrapScript = inputs.demoBootstrapScript.replace(
      "scripts/deploy-lighthouse-demo.sh",
      "echo skip demo deploy",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "scripts/bootstrap-lighthouse-demo.sh missing scripts/deploy-lighthouse-demo.sh",
    );
  });

  it("rejects a demo deploy script that enables production trusted proxy", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.demoDeployScript += "\nAUTH_TRUSTED_PROXY=true";

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "scripts/deploy-lighthouse-demo.sh must not enable trusted proxy",
    );
  });

  it("rejects a production deploy script that skips the trusted auth adapter", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.productionDeployScript = inputs.productionDeployScript.replace(
      "systemctl enable --now zkgl-auth-adapter",
      "echo skipping auth adapter",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "scripts/deploy-lighthouse-production.sh missing systemctl enable --now zkgl-auth-adapter",
    );
  });

  it("rejects a missing fail-closed verifier template", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.verifierTemplate = "export async function other() {}";

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/auth/cloudbase-token-verifier.example.mjs missing export async function verifyAccessToken",
    );
  });

  it("rejects missing LF enforcement for Ubuntu deployment assets", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.gitAttributes = "*.sh text=auto";

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      ".gitattributes missing *.sh text eol=lf",
    );
  });

  it("rejects timer drift that would stop the export worker cadence", async () => {
    const { verifyServerDeploymentAssetInputs } =
      await loadServerDeploymentAssetsModule();
    const inputs = validInputs();
    inputs.exportWorkerTimer = inputs.exportWorkerTimer.replace(
      "OnUnitActiveSec=5min",
      "OnUnitActiveSec=30min",
    );

    expect(() => verifyServerDeploymentAssetInputs(inputs)).toThrow(
      "deploy/systemd/zkgl-export-worker.timer missing OnUnitActiveSec=5min",
    );
  });
});
