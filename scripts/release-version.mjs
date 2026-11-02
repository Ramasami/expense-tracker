import { execFileSync } from "node:child_process";
// v1.0.3 is the last release numbered by workflow run. Count subsequent commits
// so independent Pages/release builds always embed the same immutable version.
try {
  const count = Number(execFileSync("git", ["rev-list", "--count", "511a0354754e60fff6ddbc78c8c7370947d3d9ad..HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  if (!Number.isInteger(count) || count < 0) throw Error("Invalid commit count");
  process.stdout.write(`v1.0.${3 + count}`);
} catch {
  process.stdout.write("Development");
}
