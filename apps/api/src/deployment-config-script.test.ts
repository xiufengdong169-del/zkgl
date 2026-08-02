import { describe, expect, it } from "vitest";

type DeploymentInputs = {
  cloudbaseConfig: {
    envId: string;
    functionRoot: string;
    functions: Array<{
      name: string;
      dir: string;
      runtime: string;
      handler: string;
      timeout: number;
      memorySize: number;
      installDependency: boolean;
      triggers?: Array<{ name: string; type: string; config: string }>;
    }>;
  };
  envExample: string;
  webEnvTypes: string;
  packageJson: {
    engines?: { node?: string };
    scripts?: Record<string, string>;
  };
  workflow: string;
  deploymentDoc: string;
  finalChecklist: string;
};

type DeploymentConfigModule = {
  verifyDeploymentConfigInputs(inputs: DeploymentInputs): string;
  envValue(source: string, key: string): string | undefined;
  expected: {
    cloudbaseEnvId: string;
    cloudbaseRegion: string;
    nodeVersion: string;
    functions: DeploymentInputs["cloudbaseConfig"]["functions"];
  };
};

async function loadDeploymentConfigModule() {
  // @ts-expect-error script module is outside the TypeScript source root.
  return (await import("../../../scripts/verify-deployment-config.mjs")) as DeploymentConfigModule;
}

function makeValidInputs(expected: DeploymentConfigModule["expected"]): DeploymentInputs {
  const envExample = [
    `VITE_CLOUDBASE_ENV_ID=${expected.cloudbaseEnvId}`,
    `VITE_CLOUDBASE_REGION=${expected.cloudbaseRegion}`,
    "VITE_CLOUDBASE_PUBLISHABLE_KEY=",
    "VITE_API_BASE_URL=",
    "DB_HOST=",
    "DB_PORT=",
    "DB_NAME=",
    "DB_USER=",
    `DB_${"PASSWORD"}=`,
    `CLOUDBASE_ENV_ID=${expected.cloudbaseEnvId}`,
  ].join("\n");

  const webEnvTypes = [
    "interface ImportMetaEnv {",
    "  readonly VITE_CLOUDBASE_ENV_ID: string",
    "  readonly VITE_CLOUDBASE_REGION: string",
    "  readonly VITE_CLOUDBASE_PUBLISHABLE_KEY?: string",
    "  readonly VITE_API_BASE_URL?: string",
    "}",
  ].join("\n");

  return {
    cloudbaseConfig: {
      envId: expected.cloudbaseEnvId,
      functionRoot: "./functions",
      functions: expected.functions.map((fn) => ({
        ...fn,
        triggers: structuredClone(fn.triggers ?? []),
        runtime: "Nodejs18.15",
        handler: "index.main",
        installDependency: true,
      })),
    },
    envExample,
    webEnvTypes,
    packageJson: {
      engines: { node: `>=${expected.nodeVersion}` },
      scripts: {
        verify: "npm run typecheck && npm run verify:deployment-config",
        "verify:deployment-config": "node scripts/verify-deployment-config.mjs",
      },
    },
    workflow: `permissions:\n  contents: read\nnode-version: "${expected.nodeVersion}"`,
    deploymentDoc: `${expected.cloudbaseEnvId}\n${expected.cloudbaseRegion}`,
    finalChecklist: expected.cloudbaseEnvId,
  };
}

describe("deployment config verifier script", () => {
  it("accepts aligned CloudBase environment, functions, CI, and docs config", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();

    expect(verifyDeploymentConfigInputs(makeValidInputs(expected))).toBe(
      "Deployment config verified",
    );
  });

  it("rejects blank-example drift that would leak real server values or deployed URLs", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();
    const inputs = makeValidInputs(expected);
    inputs.envExample = inputs.envExample
      .replace(`DB_${"PASSWORD"}=`, `DB_${"PASSWORD"}=real-password`)
      .replace("VITE_API_BASE_URL=", "VITE_API_BASE_URL=https://api.example.com");

    expect(() => verifyDeploymentConfigInputs(inputs)).toThrow(
      "must not contain a real DB_PASSWORD value",
    );
  });

  it("rejects accidental exposure of server-only variables to frontend env types", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();
    const inputs = makeValidInputs(expected);
    inputs.webEnvTypes += `\nreadonly DB_${"PASSWORD"}?: string`;

    expect(() => verifyDeploymentConfigInputs(inputs)).toThrow(
      "exposes server-only variable",
    );
  });

  it("rejects CloudBase function runtime and timer trigger drift", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();
    const runtimeDrift = makeValidInputs(expected);
    runtimeDrift.cloudbaseConfig.functions[0]!.runtime = "Nodejs16.13";

    expect(() => verifyDeploymentConfigInputs(runtimeDrift)).toThrow(
      "runtime must be Nodejs18.15",
    );

    const triggerDrift = makeValidInputs(expected);
    triggerDrift.cloudbaseConfig.functions[1]!.triggers![0]!.config =
      "0 0 9 * * * *";

    expect(() => verifyDeploymentConfigInputs(triggerDrift)).toThrow(
      "trigger configuration mismatch",
    );
  });

  it("rejects CI workflow drift from the pinned Node version and read-only permission", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();
    const inputs = makeValidInputs(expected);
    inputs.workflow = 'permissions:\n  contents: write\nnode-version: "20.0.0"';

    expect(() => verifyDeploymentConfigInputs(inputs)).toThrow(
      `GitHub workflow must use Node.js ${expected.nodeVersion}`,
    );
  });

  it("rejects deployment commands and secret references in the verification workflow", async () => {
    const { verifyDeploymentConfigInputs, expected } =
      await loadDeploymentConfigModule();

    for (const fragment of [
      "tcb fn deploy zkgl-api --yes",
      "cloudbase login",
      "deploy",
      "secrets.CLOUDBASE_SECRET",
    ]) {
      const inputs = makeValidInputs(expected);
      inputs.workflow += `\n- run: ${fragment}`;
      expect(() => verifyDeploymentConfigInputs(inputs)).toThrow(
        "must not include deployment or secret fragment",
      );
    }
  });
});
