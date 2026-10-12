import "server-only";
import type { DbRole, Tx } from "../db";
import type { ZaloEventKey } from "@/lib/types/settings";
import type { JobStep } from "../ops";

export type DailySlot = "morning" | "evening";

export interface DailyItem {
  key: string;
  event: string;
  text: string;
  status: "planned" | "sent" | "not_sent" | "duplicate";
  /** Có kèm thông báo trong ứng dụng cho cả nhà */
  inApp: boolean;
  reason?: string;
}

export interface DailyResult {
  slot: DailySlot;
  date: string;
  dry: boolean;
  /** true = mọi bước chạy xong không lỗi */
  ok: boolean;
  items: DailyItem[];
  notes: string[];
  steps: JobStep[];
}

export interface AnnounceOptions {
  /** Kèm thông báo trong ứng dụng cho cả nhà */
  app?: { title: string; body: string; link?: string; type?: string };
  /** false = chỉ thông báo trong ứng dụng, không đăng nhóm Zalo */
  zalo?: boolean;
}

/** Ngữ cảnh truyền cho mỗi bước của cron hằng ngày. */
export interface StepCtx {
  slot: DailySlot;
  /** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
  today: string;
  /** Thứ trong tuần theo ISO (1 = Thứ Hai … 7 = Chủ Nhật) */
  dow: number;
  /** Xem trước: chỉ liệt kê tin SẼ gửi, không gửi và không ghi gì */
  dry: boolean;
  requestId: string;
  /** Transaction vai trò luuxa_worker (mặc định) */
  W<T>(fn: (tx: Tx) => Promise<T>, role?: DbRole): Promise<T>;
  /** Ngữ cảnh cho các hàm Zalo (renderZaloEvent / postToZaloGroup / postZaloEvent) */
  ctxW: { dbAs<T>(role: DbRole, fn: (tx: Tx) => Promise<T>): Promise<T> };
  /** Ghi khóa chống gửi trùng (system_post_log); true = lần đầu (được gửi), false = đã gửi trước đó. */
  once(key: string): Promise<boolean>;
  /** Gửi một tin theo MẪU của loại tin Zalo (+ thông báo trong ứng dụng nếu có `o.app`), có chống gửi trùng theo `key`. */
  announce(key: string, event: ZaloEventKey, vars: Record<string, string | undefined | null>, o?: AnnounceOptions): Promise<void>;
  /** Ghi chú hiện trong kết quả lượt chạy (Cài đặt → Hệ thống / Tích hợp Zalo → Chạy thử). */
  note(msg: string): void;
  items: DailyItem[];
}

export interface CronStep {
  /** Tên ngắn, không dấu (hiện trong lịch sử chạy): "dues", "events"… */
  name: string;
  /** Lượt chạy: sáng (07:00) / tối (19:00) */
  slots: DailySlot[];
  /** Bỏ qua khi xem trước (bước có ghi dữ liệu / không mô phỏng được) */
  skipDry?: boolean;
  /** Thời gian tối đa (ms) — mặc định 12 giây. Hàm cron chỉ có 60 giây cho cả lượt. */
  timeoutMs?: number;
  run(ctx: StepCtx): Promise<void>;
}
