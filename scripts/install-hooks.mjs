import { execFileSync } from "node:child_process";
if (!process.env.CI && process.env.HUSKY !== "0") {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      stdio: "ignore",
    });
    let current = "";
    try {
      current = execFileSync("git", ["config", "--get", "core.hooksPath"], {
        encoding: "utf8",
      }).trim();
    } catch {}
    if (current && current !== ".githooks")
      console.log(
        "Existing Git hooks preserved. Run npm run docs:sync before committing.",
      );
    else {
      execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
      console.log("Budget Tracker documentation hook installed.");
    }
  } catch {
    console.log("Git hooks skipped outside a Git checkout.");
  }
}
