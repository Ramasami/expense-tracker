import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const watcher = spawn(
  process.execPath,
  ["scripts/update-ai-docs.mjs", "--watch"],
  { stdio: "inherit" },
);
const next = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  watcher.kill(signal);
  next.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal));
next.on("exit", (code) => {
  stop();
  process.exitCode = code || 0;
});
watcher.on("exit", (code) => {
  if (!stopping && code) {
    console.error(
      "Documentation watcher stopped; shutting down the dev server.",
    );
    stop();
    process.exitCode = code;
  }
});
