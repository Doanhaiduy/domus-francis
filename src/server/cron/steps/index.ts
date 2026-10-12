import "server-only";
import type { CronStep } from "../types";
import { aiJobsStep, birthdayStep, duesStep, dutyWeekStep, eventsStep, housekeepingStep, lectionaryStep, liturgyStep, remindersStep, storageMonitorStep } from "./core";
import { managerDigestStep } from "./manager-digest";
import { dutyMondayStep } from "./duty-monday";
import { recurringEventsStep } from "./recurring-events";
import { mealReminderStep } from "./meal-reminder";
import { opsDigestStep } from "./ops-digest";
import { ledgerVerifyStep } from "./ledger-verify";
import { privacyRetentionStep } from "./privacy-retention";

/**
 * THỨ TỰ chạy các bước của cron hằng ngày (mỗi bước khai lượt sáng/tối riêng — xem `slots`).
 * Nguyên tắc: tin gửi cho NGƯỜI DÙNG trước; việc nặng / nội bộ (dọn dẹp, đo dung lượng, kiểm sổ cái) sau và dồn về lượt tối —
 * hàm cron có 60 giây, bước nặng hết giờ cũng không làm mất các tin nhắc.
 * Thêm bước mới: tạo file trong thư mục này rồi chèn vào danh sách dưới đây.
 */
export const CRON_STEPS: CronStep[] = [
  // --- tin cho cả nhà / từng người ---
  liturgyStep,
  recurringEventsStep, // tạo sự kiện định kỳ của hôm nay TRƯỚC khi nhắc sự kiện
  eventsStep,
  duesStep,
  birthdayStep,
  dutyWeekStep,
  dutyMondayStep,
  mealReminderStep,
  remindersStep,
  // --- cho người quản lý / Admin ---
  managerDigestStep,
  opsDigestStep,
  // --- việc nền nặng (lượt tối) ---
  housekeepingStep,
  aiJobsStep,
  lectionaryStep,
  storageMonitorStep,
  ledgerVerifyStep,
  privacyRetentionStep,
];
