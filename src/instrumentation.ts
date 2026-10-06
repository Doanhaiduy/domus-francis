// Tác vụ nền chạy trong tiến trình Next.js (một máy chủ local nên không cần hàng đợi riêng):
//  - app.fn_housekeeping() mỗi giờ với vai trò luuxa_worker: dọn token/nhật ký hết hạn, đánh dấu tệp mồ côi,
//    hết hạn đơn đổi ca, đóng biểu quyết quá hạn, tạo trước phân vùng audit_logs.
//  - xóa khỏi đĩa các tệp đã quá purge_after.
export async function register() {
  // Điều kiện phải đúng dạng này để Next loại bỏ import khỏi bản build Edge (pg cần module Node)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundJobs } = await import("./server/jobs");
    if (process.env.LUUXA_DISABLE_JOBS !== "true" && !process.env.VERCEL) startBackgroundJobs();
  }
}

/**
 * Mọi lỗi chưa bắt được trong Route Handler / Server Component được ghi thành MỘT dòng JSON vào log (Vercel → Logs),
 * dễ lọc theo "[server-error]". Không ghi nội dung request/cookie.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType?: string; routePath?: string }) {
  const e = err as { message?: string; digest?: string; stack?: string };
  console.error("[server-error]", JSON.stringify({ message: e?.message?.slice(0, 500), digest: e?.digest, path: request.path, method: request.method, route: context.routePath, type: context.routeType, stack: e?.stack?.split(/\r?\n/).slice(0, 6).join(" | ") }));
}
