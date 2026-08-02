import { describe, expect, it } from "vitest";

type ServerDeploymentAssetsModule = {
  verifyServerDeploymentAssetInputs(inputs: {
    apiService: string;
    reminderService: string;
    reminderTimer: string;
    exportWorkerService: string;
    exportWorkerTimer: string;
    nginxConfig: string;
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
    deploymentDoc: [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "node scripts/verify-server-deployment-assets.mjs",
    ].join("\n"),
    finalChecklist: [
      "deploy/systemd/zkgl-api.service",
      "deploy/systemd/zkgl-reminder.service",
      "deploy/systemd/zkgl-reminder.timer",
      "deploy/systemd/zkgl-export-worker.service",
      "deploy/systemd/zkgl-export-worker.timer",
      "deploy/nginx/zkgl.conf",
      "node scripts/verify-server-deployment-assets.mjs",
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
