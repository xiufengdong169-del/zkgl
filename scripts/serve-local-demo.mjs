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

function isAddressInUse(error) {
  return error && typeof error === "object" && error.code === "EADDRINUSE";
}

async function listen(server, { host, port }) {
  return await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort =
        address && typeof address !== "string" ? address.port : port;
      resolve(`http://${host}:${actualPort}/`);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function listenWithDefaultPortFallback({
  server,
  host,
  port,
  strictPort,
  logger,
}) {
  try {
    return await listen(server, { host, port });
  } catch (error) {
    if (port !== 0 && !strictPort && isAddressInUse(error)) {
      logger(
        `Local demo port ${port} is already in use; trying a free local port.`,
      );
      return await listen(server, { host, port: 0 });
    }
    throw error;
  }
}

export async function serveLocalDemo({
  host = process.env.ZKGL_LOCAL_DEMO_HOST || defaultHost,
  port = parsePort(process.env.ZKGL_LOCAL_DEMO_PORT),
  strictPort = Boolean(process.env.ZKGL_LOCAL_DEMO_PORT),
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
  const baseUrl = await listenWithDefaultPortFallback({
    server,
    host,
    port,
    strictPort,
    logger,
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
