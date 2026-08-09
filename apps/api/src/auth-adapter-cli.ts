import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createAuthAdapterServer,
  type AccessTokenVerifier,
} from "./auth-adapter.js";

const defaultHost = "127.0.0.1";
const defaultPort = 3010;

type VerifierModule = {
  verifyAccessToken?: AccessTokenVerifier;
  default?: AccessTokenVerifier | { verifyAccessToken?: AccessTokenVerifier };
};

function verifierModuleUrl(modulePath: string) {
  if (/^file:\/\//i.test(modulePath)) return modulePath;
  if (/^[a-z]+:/i.test(modulePath)) return modulePath;
  const absolute = isAbsolute(modulePath)
    ? modulePath
    : resolve(process.cwd(), modulePath);
  return pathToFileURL(absolute).href;
}

function resolveVerifier(module: VerifierModule): AccessTokenVerifier {
  if (typeof module.verifyAccessToken === "function") {
    return module.verifyAccessToken;
  }
  if (typeof module.default === "function") {
    return module.default;
  }
  if (
    module.default &&
    typeof module.default === "object" &&
    typeof module.default.verifyAccessToken === "function"
  ) {
    return module.default.verifyAccessToken;
  }
  throw new Error("Verifier module must export verifyAccessToken");
}

export async function loadAccessTokenVerifier(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AccessTokenVerifier> {
  const modulePath = environment.AUTH_TOKEN_VERIFIER_MODULE?.trim();
  if (!modulePath) {
    throw new Error("AUTH_TOKEN_VERIFIER_MODULE is required");
  }
  const module = (await import(verifierModuleUrl(modulePath))) as VerifierModule;
  return resolveVerifier(module);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const verifier = await loadAccessTokenVerifier();
    const port = Number(process.env.AUTH_ADAPTER_PORT || defaultPort);
    const host = process.env.AUTH_ADAPTER_HOST || defaultHost;
    createAuthAdapterServer(verifier).listen(port, host, () => {
      console.log(`zkgl auth adapter listening on http://${host}:${port}`);
    });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unable to start auth adapter",
    );
    process.exitCode = 1;
  }
}
