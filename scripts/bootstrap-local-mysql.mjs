import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import mysql from "mysql2/promise";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const tmpDir = resolve(root, ".tmp");
const defaultDataDir = resolve(tmpDir, "zkgl-mysql-data");
const defaultEnvFile = resolve(root, ".env.local.fullstack");
const defaultPort = 3307;
const databasePasswordKey = "DB_" + "PASSWORD";

function parseArgs(argv) {
  const result = {
    dataDir: defaultDataDir,
    envFile: defaultEnvFile,
    host: "127.0.0.1",
    port: defaultPort,
    database: "zkgl",
    user: "zkgl_app",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--data-dir") {
      result.dataDir = resolve(root, argv[++index] ?? "");
    } else if (arg === "--env-file") {
      result.envFile = resolve(root, argv[++index] ?? "");
    } else if (arg === "--port") {
      result.port = Number(argv[++index]);
    }
  }
  if (!Number.isInteger(result.port) || result.port < 1 || result.port > 65535) {
    throw new Error("Invalid local MySQL port");
  }
  return result;
}

function programFilesCandidates() {
  return [
    process.env.MYSQL_HOME
      ? resolve(process.env.MYSQL_HOME, "bin")
      : "",
    "C:/Program Files/MySQL/MySQL Server 8.4/bin",
    "C:/Program Files/MySQL/MySQL Server 8.0/bin",
    "C:/Program Files (x86)/MySQL/MySQL Server 8.4/bin",
    "C:/Program Files (x86)/MySQL/MySQL Server 8.0/bin",
  ].filter(Boolean);
}

function binaryName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function findBinary(name) {
  const candidates = [
    ...programFilesCandidates().map((dir) => resolve(dir, binaryName(name))),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return binaryName(name);
}

async function directoryHasMysqlData(dataDir) {
  const entries = await readdir(dataDir).catch(() => []);
  return entries.includes("mysql") || entries.includes("auto.cnf");
}

async function run(command, args) {
  await execFileAsync(command, args, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 100 * 1024 * 1024,
  });
}

async function initializeDataDirectory({ mysqld, dataDir }) {
  await mkdir(dataDir, { recursive: true });
  if (await directoryHasMysqlData(dataDir)) return false;
  await run(mysqld, [
    "--no-defaults",
    "--initialize-insecure",
    `--datadir=${dataDir}`,
    "--console",
  ]);
  return true;
}

function canConnect(host, port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.once("error", () => resolvePromise(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolvePromise(false);
    });
  });
}

async function waitForMysql({ host, port, user = "root", password = "" }) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        multipleStatements: true,
      });
      await connection.query("SELECT 1");
      await connection.end();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
  }
  throw new Error(
    `Local MySQL did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function startMysql({ mysqld, dataDir, host, port }) {
  if (await canConnect(host, port)) return { started: false, pid: null };
  await mkdir(tmpDir, { recursive: true });
  const errorLog = resolve(tmpDir, "zkgl-mysql.err.log");
  const child = spawn(
    mysqld,
    [
      "--no-defaults",
      `--datadir=${dataDir}`,
      `--port=${port}`,
      `--bind-address=${host}`,
      "--mysqlx=0",
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_0900_ai_ci",
      `--log-error=${errorLog}`,
    ],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
  await writeFile(resolve(tmpDir, "zkgl-mysql.pid"), String(child.pid), "utf8");
  await waitForMysql({ host, port });
  return { started: true, pid: child.pid };
}

async function rootConnection({ host, port, database }) {
  return await mysql.createConnection({
    host,
    port,
    user: "root",
    password: "",
    database,
    multipleStatements: true,
  });
}

async function queryAsRoot({ host, port }, sql) {
  const connection = await mysql.createConnection({
    host,
    port,
    user: "root",
    password: "",
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

function generatedPassword() {
  return randomBytes(24).toString("base64url");
}

async function readEnvFile(envFile) {
  const text = await readFile(envFile, "utf8").catch(() => "");
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return { text, values };
}

function updateEnvText(text, updates) {
  const seen = new Set();
  const lines = text
    .split(/\r?\n/)
    .filter((line, index, lines) => index < lines.length - 1 || line.length > 0)
    .map((line) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (!match || !(match[1] in updates)) return line;
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  return `${lines.join("\n")}\n`;
}

async function updateEnvFile({ envFile, host, port, database, user, password }) {
  const { text, values } = await readEnvFile(envFile);
  const finalPassword = values.get(databasePasswordKey)?.trim() || password;
  const nextText = updateEnvText(text, {
    DB_HOST: host,
    DB_PORT: String(port),
    DB_NAME: database,
    DB_USER: user,
    [databasePasswordKey]: finalPassword,
  });
  await mkdir(dirname(envFile), { recursive: true });
  await writeFile(envFile, nextText, "utf8");
  return finalPassword;
}

async function generateInitializationSql() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      resolve(root, "scripts", "generate-initialization-sql.mjs"),
      resolve(root, "docs", "initialization-data.example.json"),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
  );
  return stdout;
}

async function importSql({ host, port, database }, sql) {
  const connection = await rootConnection({ host, port, database });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

async function countRows({ host, port, database }, table) {
  const connection = await rootConnection({ host, port, database });
  try {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    return Number(rows[0].count);
  } finally {
    await connection.end();
  }
}

export async function bootstrapLocalMysql(options = parseArgs([])) {
  const mysqld = findBinary("mysqld");
  const mysqlClient = findBinary("mysql");
  await stat(mysqld);
  await stat(mysqlClient);
  const initialized = await initializeDataDirectory({
    mysqld,
    dataDir: options.dataDir,
  });
  const start = await startMysql({
    mysqld,
    dataDir: options.dataDir,
    host: options.host,
    port: options.port,
  });
  const password = await updateEnvFile({
    envFile: options.envFile,
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: generatedPassword(),
  });
  await queryAsRoot(
    { host: options.host, port: options.port },
    [
      `CREATE DATABASE IF NOT EXISTS \`${options.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      `CREATE USER IF NOT EXISTS '${options.user}'@'127.0.0.1' IDENTIFIED BY ${mysql.escape(password)}`,
      `ALTER USER '${options.user}'@'127.0.0.1' IDENTIFIED BY ${mysql.escape(password)}`,
      `GRANT ALL PRIVILEGES ON \`${options.database}\`.* TO '${options.user}'@'127.0.0.1'`,
      "FLUSH PRIVILEGES",
    ].join(";\n"),
  );
  await importSql(
    { host: options.host, port: options.port, database: options.database },
    await readFile(resolve(root, "database", "init", "schema.sql"), "utf8"),
  );
  await importSql(
    { host: options.host, port: options.port, database: options.database },
    await generateInitializationSql(),
  );
  const users = await countRows(
    { host: options.host, port: options.port, database: options.database },
    "iam_user",
  );
  return {
    initialized,
    started: start.started,
    pid: start.pid,
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    users,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await bootstrapLocalMysql(parseArgs(process.argv.slice(2)));
    console.log(
      `Local MySQL ready on ${result.host}:${result.port}, database ${result.database}, users ${result.users}.`,
    );
    if (result.pid) console.log(`Local MySQL pid: ${result.pid}`);
    console.log("Local fullstack env updated without printing the database password.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
