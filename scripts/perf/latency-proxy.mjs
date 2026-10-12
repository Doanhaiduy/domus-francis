#!/usr/bin/env node
// Proxy TCP thêm độ trễ mạng giả lập giữa ứng dụng và PostgreSQL LOCAL — để đo/tối ưu hiệu năng như khi DB ở xa (Supabase)
// mà không cần kết nối ra ngoài. Mỗi chiều bị trễ --delay ms (vòng mạng = 2 × delay).
//
//   node scripts/perf/latency-proxy.mjs [--port 54339] [--target 54329] [--delay 20]
//   rồi chạy app với DATABASE_URL trỏ tới 127.0.0.1:54339 thay vì 54329.
import net from "node:net";

const args = process.argv.slice(2);
const get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PORT = Number(get("--port", "54339"));
const TARGET = Number(get("--target", "54329"));
const DELAY = Number(get("--delay", "20"));

function pipeDelayed(from, to) {
  from.on("data", (chunk) => {
    // Cùng một độ trễ cho mọi gói ⇒ setTimeout giữ đúng thứ tự
    setTimeout(() => {
      if (!to.destroyed) to.write(chunk);
    }, DELAY);
  });
  from.on("end", () => setTimeout(() => to.end(), DELAY));
  from.on("error", () => to.destroy());
}

let conns = 0;
net
  .createServer((client) => {
    conns++;
    const server = net.connect(TARGET, "127.0.0.1");
    pipeDelayed(client, server);
    pipeDelayed(server, client);
    client.on("close", () => {
      server.destroy();
      conns--;
    });
    server.on("close", () => client.destroy());
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[latency-proxy] 127.0.0.1:${PORT} → 127.0.0.1:${TARGET}, trễ ${DELAY} ms mỗi chiều (RTT ≈ ${DELAY * 2} ms)`));

setInterval(() => conns && console.log(`[latency-proxy] ${conns} kết nối đang mở`), 60_000).unref();
