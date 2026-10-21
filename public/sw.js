// たね：オフラインでも開けるようにする。画面は「まず通信、だめなら保存分」、それ以外は保存分を先に使う
const V = "tane-v1";
const CORE = ["./", "index.html", "config.js", "tane-cloud.js", "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // AIや保存の通信は素通し
  const net = fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; });
  if (e.request.mode === "navigate" || /\/(config|tane-cloud)\.js$/.test(u.pathname)) {
    e.respondWith(net.catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || net));
    net.catch(() => {});
  }
});
