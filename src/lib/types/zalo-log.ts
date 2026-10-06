// Lịch & lịch sử tin gửi nhóm Zalo (Cài đặt → Tích hợp Zalo). Xem db/app/1017_zalo_message_log.sql.

export type ZaloLogStatus = "sent" | "failed" | "skipped";

export interface ZaloLogEntryDto {
  id: string;
  at: string;
  /** Khóa loại tin (ZALO_EVENT_KEYS) hoặc "test" / null (tin tự soạn) */
  event: string | null;
  eventLabel: string;
  mode: "auto" | "manual";
  /** Người bấm gửi (tin thủ công) */
  by: string | null;
  status: ZaloLogStatus;
  error: string | null;
  body: string;
}

export interface ZaloPlannedDto {
  slot: "morning" | "evening";
  event: string;
  eventLabel: string;
  text: string;
}

export interface ZaloDayCounts {
  sent: number;
  failed: number;
  skipped: number;
  /** Số tin dự kiến (chỉ cho ngày sau hôm nay) */
  planned: number;
}

export interface ZaloMonthDto {
  month: string;
  today: string;
  /** Tin nhóm Zalo đang bật (tắt thì không có tin dự kiến) */
  enabled: boolean;
  days: Record<string, ZaloDayCounts>;
}

export interface ZaloDayDto {
  date: string;
  today: string;
  enabled: boolean;
  log: ZaloLogEntryDto[];
  planned: ZaloPlannedDto[];
  /** Những loại tin KHÔNG dự báo được trước (phụ thuộc dữ liệu lúc chạy) */
  notProjected: string[];
}
