import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve("out");
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const files = (await walk(root)).map((file) => path.relative(root, file).replaceAll("\\", "/"))
  .filter((file) => file === "index.html" || file === "favicon.ico" || file === "icon.png" || file === "apple-icon.png" || file.startsWith("_next/static/") && !file.endsWith(".map"));
const base = (process.env.PAGES_BASE_PATH || "").replace(/\/$/, "");
const assets = files.map((file) => base + "/" + file);
const version = createHash("sha256").update(JSON.stringify(assets)).update(await readFile(path.join(root, "index.html"))).digest("hex").slice(0, 16);
const prefix = "budget-tracker-shell-" + (base || "root").replaceAll("/", "_") + "-";
const source = `// Generated static app shell only. Never cache Google API requests, credentials or receipt files.
const CACHE = ${JSON.stringify(prefix + version)};
const PREFIX = ${JSON.stringify(prefix)};
const ASSETS = ${JSON.stringify(assets)};
const ROOT = ${JSON.stringify(base + "/")};
const INDEX = ${JSON.stringify(base + "/index.html")};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const versions = (await caches.keys()).filter(key => key.startsWith(PREFIX));
  const previous = versions.filter(key => key !== CACHE).slice(-1);
  await Promise.all(versions.filter(key => key !== CACHE && !previous.includes(key)).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === ROOT || url.pathname === INDEX)) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(INDEX) || Response.error();
    }));
    return;
  }
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
`;
await writeFile(path.join(root, "sw.js"), source);
console.log(`Offline app shell: ${assets.length} static assets, version ${version}`);
