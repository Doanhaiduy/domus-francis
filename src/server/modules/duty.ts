import "server-only";
import type { Tx } from "../db";
import { dutyWeekBriefs } from "./duty-weeks";
import type { DutySummaryDto } from "@/lib/types/duty";

// =====================================================================
// Tóm tắt Hậu cần cho trang Tổng quan (GET /api/v1/duty/summary): tuần trực vệ sinh hiện tại, lần trực sắp tới của tôi,
// số tuần chờ đánh giá và số sự cố đang mở.
// Hệ thống trực nhật CŨ theo ca/khu vực (roster, ca trực, check-in ca, đổi ca — bảng duty_rosters/duty_assignments/duty_swap_requests…)
// đã bỏ khỏi ứng dụng (thay bằng trực vệ sinh theo tuần — duty-weeks.ts); bảng và hàm SQL vẫn giữ nguyên để không mất lịch sử.
// =====================================================================

export async function getDutySummary(tx: Tx): Promise<DutySummaryDto> {
  const issues = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM maintenance_issues WHERE status IN ('new', 'in_progress', 'waiting_parts')");
  // dutyWeekBriefs dùng SAVEPOINT riêng ⇒ chạy tuần tự sau câu đếm
  const weekly = await dutyWeekBriefs(tx);
  return {
    today: [],
    tomorrow: [],
    myNext: null,
    openIssuesCount: issues.rows[0].n,
    pendingReviewsCount: weekly.pendingReviews ?? 0,
    thisWeek: weekly.thisWeek,
    myNextWeek: weekly.myNextWeek,
  };
}
