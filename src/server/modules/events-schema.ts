import "server-only";
import { z } from "zod";

const zId = z.string().uuid("Mã định danh không hợp lệ.");
const zIso = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), "Thời điểm không hợp lệ (ISO 8601).");
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const PollCreateSchema = z.object({
  eventId: zId.nullable().optional(),
  question: z.string().trim().min(5, "Câu hỏi biểu quyết tối thiểu 5 ký tự.").max(300, "Câu hỏi tối đa 300 ký tự."),
  description: optText(1000),
  options: z
    .array(z.string().trim().min(1, "Phương án không được để trống.").max(200, "Phương án tối đa 200 ký tự."))
    .min(2, "Cần ít nhất 2 phương án lựa chọn.")
    .max(20, "Tối đa 20 phương án."),
  isMultiSelect: z.boolean().optional(),
  maxChoices: z.number().int().min(1).max(20).optional(),
  isAnonymous: z.boolean().optional(),
  closesAt: zIso.nullable().optional(),
});
export type PollCreateInput = z.infer<typeof PollCreateSchema>;

export const EventSchema = z.object({
  title: z.string().trim().min(3, "Tên sự kiện tối thiểu 3 ký tự.").max(200, "Tên sự kiện tối đa 200 ký tự."),
  /** Ngày dạng DD/MM/YYYY hoặc YYYY-MM-DD + giờ dạng chữ ("19:30 tối") — máy chủ tự chuyển thành thời điểm */
  date: z.string().trim().max(20).optional(),
  time: z.string().trim().max(30).optional(),
  endTime: optText(30),
  /** Hoặc gửi thẳng thời điểm ISO */
  startsAt: zIso.optional(),
  endsAt: zIso.optional(),
  categoryCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "Mã danh mục không hợp lệ.").max(40).optional(),
  categoryId: zId.optional(),
  location: optText(200),
  organizerText: optText(200),
  organizerIds: z.array(zId).max(20).optional(),
  description: optText(2000),
  hasCheckIn: z.boolean().optional(),
  poll: PollCreateSchema.omit({ eventId: true }).nullable().optional(),
  /** Báo cả nhà: thông báo trong ứng dụng / đăng nhóm Zalo (chỉ khi tạo mới) */
  notifyApp: z.boolean().optional(),
  notifyZalo: z.boolean().optional(),
});
export type EventInput = z.infer<typeof EventSchema>;

export const EventPatchSchema = EventSchema.partial();

export const CancelSchema = z.object({
  reason: z.string().trim().min(3, "Nhập lý do hủy (tối thiểu 3 ký tự).").max(500),
});

export const RsvpSchema = z.object({
  rsvp: z.enum(["going", "maybe", "not_going", "none"]),
});

export const AttendanceMarkSchema = z.object({
  memberId: zId,
  status: z.enum(["present", "late", "absent"]),
  note: optText(300),
});

export const QrOpenSchema = z.object({
  /** Thời lượng phiên (phút). Mặc định: tới khi sự kiện kết thúc. */
  durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
  rotationSeconds: z.number().int().min(15).max(120).optional(),
});

export const CheckInSchema = z
  .object({
    token: z.string().trim().max(200).optional(),
    code: z.string().trim().max(20).optional(),
    eventId: zId.nullable().optional(),
    deviceId: z.string().trim().max(100).nullable().optional(),
  })
  .refine((v) => !!(v.token || v.code), { message: "Thiếu mã QR hoặc mã điểm danh 6 số." });

export const VoteSchema = z.object({
  optionIds: z.array(zId).max(20),
});
