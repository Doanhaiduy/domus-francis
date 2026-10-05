import "server-only";
import { z } from "zod";
import { zDate, zUuid } from "../http";
import { DUTY_WEEK_MAX_MEMBERS } from "@/lib/types/duty";

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
