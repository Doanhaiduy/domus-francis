import "server-only";
import { z } from "zod";
import { zDate, zUuid } from "../http";
import { DUTY_PLAN_MIN_WEEKS, DUTY_WEEK_MAX_MEMBERS } from "@/lib/types/duty";

/** Lưu/xem trước tối đa bấy nhiêu tuần một lần (giao diện cho chọn 4–8 tuần). */
const DUTY_PLAN_MAX_SAVE_WEEKS = 12;

const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} tối đa ${max} ký tự.`).nullable().optional().transform((v) => v || null);

export const SaveWeekSchema = z.object({
  weekStart: zDate,
  memberIds: z.array(zUuid).min(1, "Chọn ít nhất 1 người trực.").max(DUTY_WEEK_MAX_MEMBERS, `Mỗi tuần tối đa ${DUTY_WEEK_MAX_MEMBERS} người trực.`),
  note: optText(500, "Ghi chú"),
  /** Gửi lịch vào nhóm Zalo (nếu đã bật tích hợp) */
  notifyZalo: z.boolean().optional(),
});

export const ReviewWeekSchema = z
  .object({
    score: z.number({ error: "Chấm điểm từ 0 đến 10." }).int("Điểm phải là số nguyên.").min(0, "Điểm từ 0 đến 10.").max(10, "Điểm từ 0 đến 10."),
    comment: optText(1000, "Nhận xét"),
    redo: z.boolean().default(false),
    redoNote: optText(500, "Ghi chú trực lại"),
  });

/** Lưu nhiều tuần trong MỘT thao tác (xếp lịch tự động / sửa tay trước khi lưu). */
export const BulkWeeksSchema = z.object({
  weeks: z
    .array(
      z.object({
        weekStart: zDate,
        memberIds: z.array(zUuid).min(1, "Mỗi tuần chọn ít nhất 1 người trực.").max(DUTY_WEEK_MAX_MEMBERS, `Mỗi tuần tối đa ${DUTY_WEEK_MAX_MEMBERS} người trực.`),
        /** undefined = giữ ghi chú đang có của tuần (khi ghi đè) */
        note: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự.").nullable().optional(),
      }),
    )
    .min(1, "Chưa có tuần nào để lưu.")
    .max(DUTY_PLAN_MAX_SAVE_WEEKS, `Mỗi lần lưu tối đa ${DUTY_PLAN_MAX_SAVE_WEEKS} tuần.`),
  /** Thay cả tuần đã có người (tuần đã đánh giá thì không bao giờ đổi) */
  overwrite: z.boolean().default(false),
});

/** GET /api/v1/duty/weeks/plan */
export const PlanQuerySchema = z.object({
  from: zDate.optional(),
  weeks: z.coerce.number({ error: "Số tuần không hợp lệ." }).int().min(1, "Xếp ít nhất 1 tuần.").max(DUTY_PLAN_MAX_SAVE_WEEKS, `Xếp tối đa ${DUTY_PLAN_MAX_SAVE_WEEKS} tuần.`).default(DUTY_PLAN_MIN_WEEKS),
  overwrite: z.enum(["0", "1", "true", "false"]).optional(),
});
