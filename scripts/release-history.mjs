import { execFileSync } from "node:child_process";
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
// Build-time only: no GitHub requests, credentials or financial records in Settings.
export function releaseHistory() {
  const versions = new Map();
  for (const tag of git("tag", "--sort=version:refname")
    .split("\n")
    .filter(Boolean)) {
    versions.set(git("rev-list", "-n", "1", tag), tag);
  }
  const current = execFileSync(
    process.execPath,
    ["scripts/release-version.mjs"],
    { encoding: "utf8" },
  ).trim();
  const commits = git("log", "--reverse", "--format=%H%x09%cs%x09%s", "HEAD")
    .split("\n")
    .map((line) => {
      const [sha, date, ...subject] = line.split("\t");
      return { sha, date, title: subject.join("\t") };
    });
  const releases = [];
  let changes = [];
  for (const commit of commits) {
    changes.push(commit);
    const version = versions.get(commit.sha);
    if (version) {
      releases.push({ version, date: commit.date, changes });
      changes = [];
    }
  }
  if (changes.length)
    releases.push({ version: current, date: changes.at(-1).date, changes });
  return releases.reverse();
}
if (process.argv[1]?.endsWith("release-history.mjs"))
  process.stdout.write(JSON.stringify(releaseHistory()));
