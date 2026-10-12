import "server-only";
import { z } from "zod";
import { zUuid } from "../http";

// Lược đồ kiểm tra dữ liệu phân hệ Báo hỏng (trực vệ sinh theo tuần: duty-weeks-schema.ts).
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---- Báo hỏng ----
const zUrgency = z.enum(["low", "medium", "high", "critical"]);
export const IssueCreateSchema = z.object({
  title: z.string().trim().min(3, "Tên sự cố tối thiểu 3 ký tự.").max(200),
  description: optText(2000),
  roomCode: z.string().trim().max(14).nullable().optional(),
  locationText: optText(200),
  urgency: zUrgency.default("medium"),
  categoryId: zUuid.nullable().optional(),
  photoFileId: zUuid.nullable().optional(),
});
export const IssueUpdateSchema = z.object({
  status: z.enum(["in_progress", "waiting_parts", "done", "cancelled"]).optional(),
  reason: optText(500),
  urgency: zUrgency.optional(),
  categoryId: zUuid.nullable().optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: optText(2000),
});
export const IssueAssignSchema = z.object({ memberId: zUuid, note: optText(300) });
export const IssueCostSchema = z.object({
  amount: z.number().int("Số tiền phải là số nguyên (đồng).").min(1000, "Số tiền tối thiểu 1.000 đ.").max(1_000_000_000),
  description: z.string().trim().min(3, "Mô tả chi phí tối thiểu 3 ký tự.").max(300),
});
export const IssuePhotoSchema = z.object({ fileId: zUuid, purpose: z.enum(["before_photo", "after_photo"]).default("after_photo") });

