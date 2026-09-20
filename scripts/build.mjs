import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], {
  cwd: root,
  stdio: "inherit",
  timeout: 180_000,
  killSignal: "SIGKILL",
  env: {
    ...process.env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: `${root}.wrangler/logs`,
    MINIFLARE_REGISTRY_PATH: `${root}.wrangler/registry`,
  },
});
if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? `Build failed: ${result.signal ?? result.status}`);
  process.exit(result.status || 1);
}
await import("./validate-artifact.mjs");
