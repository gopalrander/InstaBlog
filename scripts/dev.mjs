import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const npmCli = process.env.npm_execpath;
const windowsDocker = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const dockerCommand = process.platform === "win32" && existsSync(windowsDocker)
  ? windowsDocker
  : "docker";
const childEnvironment = process.platform === "win32" && existsSync(windowsDocker)
  ? { ...process.env, PATH: `${dirname(windowsDocker)}${delimiter}${process.env.PATH ?? ""}` }
  : process.env;

if (!npmCli) {
  throw new Error("Run this script through npm.");
}

function runNpm(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    env: childEnvironment,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const compose = spawnSync(
  dockerCommand,
  ["compose", "-f", join("infra", "docker-compose.yml"), "up", "-d", "--wait"],
  {
    cwd: root,
    env: childEnvironment,
    shell: false,
    stdio: "inherit"
  }
);
if (compose.status !== 0) {
  throw new Error("Docker Compose could not start PostgreSQL.");
}

runNpm(["run", "migrate"]);

const children = [
  spawn(process.execPath, [join(rootPath, "node_modules", "tsx", "dist", "cli.mjs"), "apps/api/src/server.ts"], {
    cwd: root,
    env: childEnvironment,
    stdio: "inherit"
  }),
  spawn(process.execPath, [join(rootPath, "node_modules", "next", "dist", "bin", "next"), "dev", "apps/web"], {
    cwd: root,
    env: childEnvironment,
    stdio: "inherit"
  })
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once("exit", (code) => stop(code ?? 1));
  child.once("error", () => stop(1));
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());

process.stdout.write("\nInstaBlog local demo: http://localhost:3000\n");
process.stdout.write("API: http://localhost:3001\n\n");
process.stdout.write("Jaeger traces: http://localhost:16686\n\n");
