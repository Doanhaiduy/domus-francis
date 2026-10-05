// DTO "Lịch nhắc lặp hằng tuần" (họp nhà, sinh hoạt định kỳ…) — dùng chung client/server.

export type ReminderSlot = "morning" | "evening";

export interface ReminderDto {
  id: string;
  title: string;
  message: string | null;
  /** 1 = Thứ Hai … 7 = Chúa Nhật */
  weekdays: number[];
  slot: ReminderSlot;
  timeLabel: string | null;
  sendApp: boolean;
  sendZalo: boolean;
  isActive: boolean;
}

export interface ReminderInput {
  title: string;
  message?: string | null;
  weekdays: number[];
  slot: ReminderSlot;
  timeLabel?: string | null;
  sendApp: boolean;
  sendZalo: boolean;
  isActive?: boolean;
}

export const WEEKDAY_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export const SLOT_LABEL: Record<ReminderSlot, string> = {
  morning: "Sáng cùng ngày (7:00)",
  evening: "Chiều tối cùng ngày (19:00)",
};
