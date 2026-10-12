/* Service worker của Lưu Xá Phanxicô: nhận thông báo đẩy + trang "mất kết nối". KHÔNG đệm dữ liệu API/trang đăng nhập
   (tránh lộ dữ liệu người trước trên máy dùng chung) — chỉ đệm duy nhất /offline.html để hiện khi mất mạng. */
const OFFLINE_CACHE = "luuxa-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Chỉ can thiệp khi ĐIỀU HƯỚNG trang thất bại do mất mạng
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Lưu Xá Phanxicô", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Lưu Xá Phanxicô";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.tag || undefined,
      renotify: false,
      requireInteraction: !!data.urgent,
      // url: trang mở khi bấm (đường dẫn trong ứng dụng); nid: id thông báo để đánh dấu đã đọc
      data: { url: data.url || "/", nid: data.nid || null },
    })
  );
});

/** Chỉ mở đường dẫn TRONG ứng dụng (tương đối) — chặn liên kết ra ngoài. */
function appPath(u) {
  return typeof u === "string" && u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\") ? u : "/";
}

/** Gắn ?n=<id thông báo> (hoặc &n=) — trang mở ra đánh dấu đúng thông báo đó đã đọc rồi gỡ tham số (components/NotificationDeepLink.tsx). */
function withNid(path, nid) {
  if (!nid || !/^[0-9a-f-]{36}$/i.test(String(nid))) return path;
  const hashAt = path.indexOf("#");
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  return base + (base.includes("?") ? "&" : "?") + "n=" + encodeURIComponent(nid) + hash;
}

/** Nhờ cửa sổ đang mở tự chuyển trang bằng bộ định tuyến của ứng dụng (không tải lại cả trang). Không trả lời trong 1,5 giây ⇒ false. */
function askClientToOpen(client, url) {
  return new Promise((resolve) => {
    let done = false;
    let ch = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        if (ch) ch.port1.close();
      } catch (e) {
        /* bỏ qua */
      }
      resolve(ok);
    };
    try {
      ch = new MessageChannel();
      ch.port1.onmessage = (e) => finish(!!(e.data && e.data.ok));
      client.postMessage({ type: "luuxa:open-url", url: url }, [ch.port2]);
    } catch (e) {
      finish(false);
    }
    setTimeout(() => finish(false), 1500);
  });
}

// Bấm thông báo: đưa cửa sổ ứng dụng đang mở lên trước rồi mở đúng trang (kèm ?n=<id>); chưa mở cửa sổ nào ⇒ mở cửa sổ mới.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = withNid(appPath(data.url), data.nid);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const mine = list.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch (e) {
          return false;
        }
      });
      // Ưu tiên cửa sổ đang được chọn / đang hiện
      mine.sort((a, b) => Number(!!b.focused) - Number(!!a.focused) || Number(b.visibilityState === "visible") - Number(a.visibilityState === "visible"));
      const client = mine[0];
      if (client) {
        try {
          await client.focus();
        } catch (e) {
          /* trình duyệt không cho đưa lên trước — vẫn điều hướng */
        }
        if (await askClientToOpen(client, path)) return;
        if ("navigate" in client) {
          try {
            await client.navigate(target);
            return;
          } catch (e) {
            /* cửa sổ chưa do service worker này điều khiển ⇒ mở cửa sổ mới */
          }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
