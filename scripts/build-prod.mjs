import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = path.resolve(rootDir, "deploy");

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: rootDir, ...opts });
}

rmSync(path.resolve(deployDir, "dist"), { recursive: true, force: true });
rmSync(path.resolve(deployDir, "db-schema"), { recursive: true, force: true });

console.log("\n=== Building frontend (Vite) ===\n");
run("pnpm --filter @workspace/vpn-panel run build", {
  env: { ...process.env, BASE_PATH: "/", PORT: "4173", NODE_ENV: "production" },
});

console.log("\n=== Building API server (esbuild) ===\n");
run("pnpm --filter @workspace/api-server run build");

mkdirSync(path.resolve(deployDir, "dist"), { recursive: true });

cpSync(
  path.resolve(rootDir, "artifacts/api-server/dist"),
  path.resolve(deployDir, "dist"),
  { recursive: true },
);

cpSync(
  path.resolve(rootDir, "artifacts/vpn-panel/dist/public"),
  path.resolve(deployDir, "dist/public"),
  { recursive: true },
);

cpSync(
  path.resolve(rootDir, "lib/db/src/schema"),
  path.resolve(deployDir, "db-schema"),
  { recursive: true },
);

writeFileSync(
  path.resolve(deployDir, "package.json"),
  JSON.stringify(
    {
      name: "vpn-panel-deploy",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        start: "node --enable-source-maps dist/index.mjs",
        "db:push": "drizzle-kit push --config ./drizzle.config.ts",
      },
      dependencies: {
        "drizzle-kit": "^0.31.9",
        "drizzle-orm": "^0.45.1",
        "drizzle-zod": "^0.7.1",
        pg: "^8.20.0",
        zod: "^3.25.76",
      },
    },
    null,
    2,
  ) + "\n",
);

console.log("\n=== Build complete! Output in deploy/ ===\n");
