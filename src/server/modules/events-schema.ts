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

/** Điểm danh bằng ảnh: sự kiện + mã ảnh đã tải lên. */
export const CheckInSchema = z.object({
  eventId: zId,
  fileId: zId,
});

export const VoteSchema = z.object({
  optionIds: z.array(zId).max(20),
});

// ---------------------------------------------------------------------
// Sự kiện định kỳ (lặp hằng tuần)
// ---------------------------------------------------------------------
const zDay = z.string().trim().max(20);
const zWeekdays = z
  .array(z.number().int().min(1, "Thứ không hợp lệ.").max(7, "Thứ không hợp lệ."))
  .min(1, "Chọn ít nhất một thứ trong tuần.")
  .max(7);

const SeriesFields = {
  title: z.string().trim().min(3, "Tên sự kiện tối thiểu 3 ký tự.").max(200, "Tên sự kiện tối đa 200 ký tự."),
  /** Giờ bắt đầu dạng chữ như form sự kiện ("21:00", "9h tối") */
  time: z.string().trim().min(1, "Nhập giờ bắt đầu.").max(30),
  endTime: optText(30),
  categoryCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "Mã danh mục không hợp lệ.").max(40).optional(),
  categoryId: zId.optional(),
  location: optText(200),
  organizerText: optText(200),
  organizerIds: z.array(zId).max(20).optional(),
  description: optText(2000),
  hasCheckIn: z.boolean().optional(),
  weekdays: zWeekdays,
  intervalWeeks: z.number().int().min(1, "Chu kỳ tối thiểu 1 tuần.").max(4, "Chu kỳ tối đa 4 tuần.").optional(),
  /** Ngày kết thúc (DD/MM/YYYY hoặc YYYY-MM-DD) — hoặc count — hoặc để trống (không kết thúc) */
  untilDate: zDay.nullable().optional(),
  count: z.number().int().min(1, "Số buổi tối thiểu 1.").max(200, "Tối đa 200 buổi.").nullable().optional(),
};

export const SeriesCreateSchema = z.object({
  ...SeriesFields,
  /** Ngày bắt đầu chuỗi */
  startsOn: zDay,
  notifyApp: z.boolean().optional(),
  notifyZalo: z.boolean().optional(),
});
export type SeriesCreateInput = z.infer<typeof SeriesCreateSchema>;

export const SeriesPatchSchema = z
  .object(SeriesFields)
  .partial()
  .extend({
    /** Áp dụng cho các buổi từ ngày này (mặc định hôm nay); buổi đã diễn ra không đổi */
    fromDate: zDay.optional(),
    /** Tiếp tục chuỗi đã dừng */
    isActive: z.literal(true).optional(),
    /** true = bỏ ngày kết thúc (lặp không kết thúc) */
    noEnd: z.boolean().optional(),
  });
export type SeriesPatchInput = z.infer<typeof SeriesPatchSchema>;

export const SeriesSkipSchema = z.object({
  date: zDay,
  reason: optText(300),
  /** Báo cả nhà (thông báo trong ứng dụng) */
  notify: z.boolean().optional(),
});

export const SeriesRestoreSchema = z.object({ date: zDay });

export const SeriesStopSchema = z.object({
  /** Dừng từ ngày (mặc định hôm nay): các buổi chưa diễn ra từ ngày này bị gỡ khỏi lịch */
  fromDate: zDay.optional(),
  reason: optText(300),
  notify: z.boolean().optional(),
});

// ---------------------------------------------------------------------
// Đồng bộ lịch (đường dẫn .ics cá nhân)
// ---------------------------------------------------------------------
export const FeedTokenCreateSchema = z.object({
  label: z.string().trim().max(60, "Tên gợi nhớ tối đa 60 ký tự.").nullable().optional(),
});
