// Hàm thuần của trang theo dõi dung lượng (dùng chung máy chủ — cron cảnh báo — và giao diện).
import type { MonitorLevel, MonitorLimits } from "@/lib/types/storage-monitor";

export const DAY_MS = 24 * 3600 * 1000;

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  const b = Math.max(0, bytes);
  if (b < 1024) return `${Math.round(b)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(digits)} ${units[i]}`;
}

/** % đã dùng (0–100+), null nếu thiếu số liệu hoặc hạn mức ≤ 0 */
export function percentOf(used: number | null | undefined, limit: number | null | undefined): number | null {
  if (used === null || used === undefined || !limit || limit <= 0) return null;
  return (used / limit) * 100;
}

export function levelOf(percent: number | null, limits: Pick<MonitorLimits, "warnPercent" | "criticalPercent">): MonitorLevel {
  if (percent === null || !Number.isFinite(percent)) return "unknown";
  if (percent >= limits.criticalPercent) return "critical";
  if (percent >= limits.warnPercent) return "warn";
  return "ok";
}

export const LEVEL_LABEL: Record<MonitorLevel, string> = {
  ok: "Ổn",
  warn: "Cần chú ý",
  critical: "Sắp đầy",
  unknown: "Chưa đo được",
};

/**
 * Dự báo số ngày nữa thì đầy theo tốc độ tăng trung bình mỗi ngày. null = không dự báo được (chưa đủ dữ liệu / không tăng).
 * 0 = đã đầy.
 */
export function daysUntilFull(used: number | null, limit: number | null, bytesPerDay: number | null): number | null {
  if (used === null || !limit || limit <= 0) return null;
  if (used >= limit) return 0;
  if (!bytesPerDay || bytesPerDay <= 0) return null;
  return Math.ceil((limit - used) / bytesPerDay);
}

export function formatDaysLeft(days: number | null): string {
  if (days === null) return "chưa đủ dữ liệu để dự báo";
  if (days === 0) return "đã đầy";
  if (days > 365 * 3) return "hơn 3 năm";
  if (days >= 365) return `~${(days / 365).toFixed(1)} năm`;
  if (days >= 60) return `~${Math.round(days / 30)} tháng`;
  return `~${days} ngày`;
}

/**
 * Tốc độ tăng/ngày từ chuỗi điểm (day, value) theo thời gian: lấy điểm cũ nhất trong khoảng và điểm mới nhất.
 * Cần ít nhất 3 ngày chênh lệch mới coi là đáng tin.
 */
export function growthPerDay(points: { day: string; value: number | null }[]): number | null {
  const pts = points.filter((p): p is { day: string; value: number } => p.value !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = (Date.parse(last.day) - Date.parse(first.day)) / DAY_MS;
  if (!Number.isFinite(span) || span < 3) return null;
  return (last.value - first.value) / span;
}

/** Gợi ý việc cần làm khi một chỉ số chạm ngưỡng. */
export function adviceFor(metric: "db" | "storage" | "cloudinary", level: MonitorLevel): string[] {
  if (level === "ok" || level === "unknown") return [];
  const urgent = level === "critical";
  if (metric === "db") {
    return [
      "Xem bảng lớn nhất ở dưới: bảng nhật ký (audit/hoạt động) thường là bảng phình nhanh — có thể dọn bản ghi cũ theo chính sách lưu trữ.",
      "Xóa dữ liệu rác bằng nút Admin ở từng trang (đơn xin phép, báo hỏng, ý cầu nguyện…).",
      urgent ? "Nâng gói Supabase (Pro) nếu cần giữ toàn bộ dữ liệu — CSDL đầy sẽ làm ứng dụng ngừng ghi được." : "Chưa cần nâng gói; theo dõi xu hướng và dự báo ngày đầy.",
    ];
  }
  if (metric === "storage") {
    return [
      "Dọn tệp kẹt (chưa xử lý xong) và xóa ảnh/tệp cũ không còn cần ở các trang tương ứng.",
      "Ảnh đã tự nén ở trình duyệt; nếu vẫn tăng nhanh, xem 'Người tải lên nhiều nhất' và 'Tệp lớn nhất' để biết nguồn.",
      urgent ? "Nâng gói Supabase (Pro) hoặc chuyển bớt tệp lớn sang nơi lưu khác trước khi đầy — đầy thì không tải lên được nữa." : "Chưa cần nâng gói; theo dõi dự báo ngày đầy.",
    ];
  }
  return [
    "Video là phần ngốn credits nhất: xem tab Khoảnh khắc, xóa video cũ/nặng không còn cần.",
    "Giảm băng thông: hạ chất lượng/kích thước video tải lên hoặc tắt HLS (VIDEO_HLS=0) nếu lượt xem nhiều.",
    urgent ? "Hết credits thì Cloudinary có thể giới hạn chuyển mã/phát video đến kỳ sau — cân nhắc nâng gói hoặc chuyển video sang Supabase (≤ 50 MB/video)." : "Credits tính lại theo chu kỳ hằng tháng; theo dõi xem có vượt trước khi hết chu kỳ không.",
  ];
}
