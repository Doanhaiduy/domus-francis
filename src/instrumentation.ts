// Tác vụ nền chạy TRONG tiến trình Next.js — CHỈ khi tự chạy máy chủ (local / `pnpm start`), KHÔNG chạy trên Vercel (hàm serverless không sống lâu):
//  - app.fn_housekeeping() mỗi giờ với vai trò luuxa_worker: dọn token/nhật ký hết hạn, đánh dấu tệp mồ côi,
//    hết hạn đơn đổi ca, đóng biểu quyết quá hạn, tạo trước phân vùng audit_logs; xóa khỏi kho các tệp đã quá purge_after.
//  - nhắc lễ mỗi 30 phút, nạp Lời Chúa mỗi ngày.
// Trên Vercel các việc này chạy trong 2 lượt Vercel Cron mỗi ngày (07:00 và 19:00 giờ VN — /api/cron/daily, xem src/server/cron/daily.ts);
// lịch sử từng lượt chạy lưu ở bảng job_runs (Cài đặt → Hệ thống).
export async function register() {
  // Điều kiện phải đúng dạng này để Next loại bỏ import khỏi bản build Edge (pg cần module Node)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundJobs } = await import("./server/jobs");
    if (process.env.LUUXA_DISABLE_JOBS !== "true" && !process.env.VERCEL) startBackgroundJobs();
    // Máy chủ chạy lâu: mở sẵn vài kết nối DB (DB_POOL_WARM, mặc định 3) để lần tải trang đầu không chờ bắt tay TLS với DB ở xa.
    // Trên Vercel (serverless) bỏ qua — mở sẵn chỉ làm chậm lúc khởi động lạnh.
    if (!process.env.VERCEL) {
      const { warmPool } = await import("./server/db");
      warmPool().catch((e) => console.warn("[db] không mở sẵn được kết nối:", (e as Error).message));
    }
  }
}

/**
 * Lỗi chưa bắt trong Route Handler / Server Component (hook của Next.js ≥ 15 — Next 14.2 đang dùng KHÔNG gọi hàm này; nó sẽ tự có tác dụng
 * khi nâng cấp). Hiện tại lỗi API được ghi bởi api() (src/server/http.ts) vào log + bảng error_events, lỗi giao diện qua
 * /api/v1/public/client-error. Không ghi nội dung request/cookie.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType?: string; routePath?: string }) {
  const e = err as { message?: string; digest?: string; stack?: string };
  console.error("[server-error]", JSON.stringify({ message: e?.message?.slice(0, 500), digest: e?.digest, path: request.path, method: request.method, route: context.routePath, type: context.routeType, stack: e?.stack?.split(/\r?\n/).slice(0, 6).join(" | ") }));
  // Điều kiện đúng dạng này để Next loại import khỏi bản build Edge (pg chỉ chạy trên Node)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordErrorEvent } = await import("./server/ops");
      await recordErrorEvent({ source: "server", route: `${request.method} ${context.routePath ?? request.path}`, code: context.routeType ?? null, message: e?.message ?? "unknown", requestId: e?.digest ?? null });
    } catch {
      /* bỏ qua */
    }
  }
}
