// Tác vụ nền chạy trong tiến trình Next.js (một máy chủ local nên không cần hàng đợi riêng):
//  - app.fn_housekeeping() mỗi giờ với vai trò luuxa_worker: dọn token/nhật ký hết hạn, đánh dấu tệp mồ côi,
//    hết hạn đơn đổi ca, đóng biểu quyết quá hạn, tạo trước phân vùng audit_logs.
//  - xóa khỏi đĩa các tệp đã quá purge_after.
export async function register() {
  // Điều kiện phải đúng dạng này để Next loại bỏ import khỏi bản build Edge (pg cần module Node)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundJobs } = await import("./server/jobs");
    if (process.env.LUUXA_DISABLE_JOBS !== "true") startBackgroundJobs();
  }
}
