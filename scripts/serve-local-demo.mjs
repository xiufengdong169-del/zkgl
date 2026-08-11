import { pathToFileURL } from "node:url";

import {
  buildLocalDemoBundle,
  createDemoStaticServer,
  defaultOutDir,
  verifyLocalDemoAssets,
} from "./verify-local-demo.mjs";
import { verifyPublicDemo } from "./verify-public-demo.mjs";
import { verifyWebDistSecurity } from "./verify-web-dist-security.mjs";

const defaultHost = "127.0.0.1";
const defaultPort = 4173;

function parsePort(value) {
  if (!value) return defaultPort;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid local demo port: ${value}`);
  }
  return port;
}

export async function serveLocalDemo({
  host = process.env.ZKGL_LOCAL_DEMO_HOST || defaultHost,
  port = parsePort(process.env.ZKGL_LOCAL_DEMO_PORT),
  outDir = defaultOutDir,
  buildDemo = buildLocalDemoBundle,
  verifyDist = verifyWebDistSecurity,
  verifyDemo = verifyPublicDemo,
  verifyAssets = verifyLocalDemoAssets,
  logger = console.log,
} = {}) {
  await buildDemo({ outDir });
  await verifyDist({ dist: outDir });

  const server = createDemoStaticServer({ dist: outDir });
  const baseUrl = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      const actualPort =
        address && typeof address !== "string" ? address.port : port;
      resolve(`http://${host}:${actualPort}/`);
    });
  });

  try {
    await verifyDemo({ baseUrl });
    await verifyAssets({ baseUrl, dist: outDir });
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }

  logger(`Local demo ready: ${baseUrl}`);
  logger("Press Ctrl+C to stop.");
  return { baseUrl, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = await serveLocalDemo();
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
