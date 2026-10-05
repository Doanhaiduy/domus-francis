import "server-only";
import { z } from "zod";
import { zDate, zUuid } from "../http";

const optText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---- Trực nhật ----
export const RosterCreateSchema = z.object({
  weekStart: zDate,
  notes: optText(500),
  copyFromWeek: zDate.nullable().optional(),
});

export const AssignmentCreateSchema = z.object({
  date: zDate,
  areaId: zUuid,
  shiftId: zUuid,
  roomCode: z.string().trim().max(14).nullable().optional(),
  memberIds: z.array(zUuid).min(1, "Chọn ít nhất một người trực.").max(30),
  overrideReason: optText(300),
});

export const AssignmentUpdateSchema = z.object({
  memberIds: z.array(zUuid).min(1, "Ca trực phải có ít nhất một người.").max(30).optional(),
  roomCode: z.string().trim().max(14).nullable().optional(),
  overrideReason: optText(300),
  date: zDate.optional(),
  areaId: zUuid.optional(),
  shiftId: zUuid.optional(),
});

export const CheckinSchema = z.object({
  fileId: z.string().uuid("Hãy tải lên ảnh minh chứng sau khi dọn."),
  doneItemIds: z.array(zUuid).max(50).default([]),
  note: optText(1000),
  clientCapturedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const ReviewSchema = z
  .object({
    decision: z.enum(["approved", "rework"]),
    score: z.number().int().min(1).max(5).nullable().optional(),
    feedback: optText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "approved" && !v.score) ctx.addIssue({ code: "custom", path: ["score"], message: "Chấm điểm 1–5 sao khi nghiệm thu đạt." });
    if (v.decision === "rework" && (v.feedback ?? "").trim().length < 5)
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "Ghi rõ điểm cần dọn lại (tối thiểu 5 ký tự)." });
  });

export const SwapCreateSchema = z.object({
  assignmentId: zUuid,
  toMemberId: zUuid,
  reason: z.string().trim().min(5, "Lý do xin đổi ca tối thiểu 5 ký tự.").max(500),
});

export const SwapRespondSchema = z.object({ accept: z.boolean(), note: optText(300) });
export const SwapDecideSchema = z.object({ approve: z.boolean(), note: optText(300) });

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

// ---- Máy giặt ----
export const LaundryBookSchema = z.object({ machineId: zUuid, date: zDate, slotIndex: z.number().int().min(0).max(23) });
export const LaundryActionSchema = z.object({ action: z.enum(["checkin", "complete"]) });

// ---- Mượn đồ ----
export const BorrowSchema = z.object({ dueAt: z.string().datetime({ offset: true, message: "Hạn trả không hợp lệ." }) });
export const ReturnSchema = z.object({ note: optText(300) });
export const AssetCreateSchema = z.object({
  name: z.string().trim().min(2, "Tên thiết bị tối thiểu 2 ký tự.").max(150),
  type: z.enum(["furniture", "electrical", "appliance", "plumbing", "audio_visual", "tool", "safety", "kitchenware", "other"]),
  locationText: optText(200),
  roomCode: z.string().trim().max(14).nullable().optional(),
  isLoanable: z.boolean().default(true),
  notes: optText(500),
});
