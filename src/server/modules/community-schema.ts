import "server-only";
import { z } from "zod";
import { zDate, zText, zUuid } from "../http";

export const CreateAnnouncementSchema = z.object({
  title: zText(3, 200, "Tiêu đề"),
  content: zText(1, 20000, "Nội dung"),
  categoryId: zUuid,
  targets: z
    .array(z.object({ type: z.enum(["role", "floor", "room", "member"]), id: zUuid }))
    .max(50)
    .optional(),
  isPinned: z.boolean().optional(),
  requiresAck: z.boolean().optional(),
  ackDeadline: z.string().datetime({ offset: true, message: "Hạn xác nhận không hợp lệ." }).nullable().optional(),
  eventId: zUuid.nullable().optional(),
  attachmentFileId: zUuid.nullable().optional(),
  notify: z.boolean().optional(),
});

export const PinSchema = z.object({ pinned: z.boolean() });
export const ReadSchema = z.object({ acknowledge: z.boolean().optional() });
export const RsvpSchema = z.object({ going: z.boolean() });

export const ForumPostSchema = z.object({
  title: zText(3, 200, "Tiêu đề"),
  content: zText(1, 10000, "Nội dung"),
  categoryId: zUuid,
});

export const ForumPostPatchSchema = z.object({
  title: zText(3, 200, "Tiêu đề").optional(),
  content: zText(1, 10000, "Nội dung").optional(),
  categoryId: zUuid.optional(),
  isPinned: z.boolean().optional(),
  status: z.enum(["published", "hidden", "locked"]).optional(),
});

export const CommentSchema = z.object({
  content: zText(1, 3000, "Bình luận"),
  parentId: zUuid.nullable().optional(),
});

export const CommentPatchSchema = z.object({
  content: zText(1, 3000, "Bình luận").optional(),
  status: z.enum(["published", "hidden"]).optional(),
});

export const ReportSchema = z.object({ reason: zText(5, 1000, "Lý do") });
export const ResolveReportsSchema = z.object({
  status: z.enum(["dismissed", "actioned"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export const PrayerSchema = z.object({
  content: zText(5, 1000, "Ý cầu nguyện"),
  anonymous: z.boolean().optional(),
});
export const PrayerStatusSchema = z.object({ status: z.enum(["open", "answered", "closed"]) });
export const PrayerVisibilitySchema = z.object({ hidden: z.boolean() });
export const RevealSchema = z.object({ reason: zText(10, 500, "Lý do") });

export const SessionSchema = z.object({
  title: zText(3, 200, "Tên buổi phụng vụ"),
  date: zDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:MM."),
  durationMinutes: z.number().int().min(10).max(600).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  patron: z.boolean().optional(),
});
export const CancelSessionSchema = z.object({ reason: zText(3, 500, "Lý do hủy") });

export const AssignmentSchema = z.object({
  eventId: zUuid,
  roleCode: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Vai trò không hợp lệ."),
  memberId: zUuid,
  note: z.string().trim().max(300).nullable().optional(),
});
export const AssignmentStatusSchema = z.object({ status: z.enum(["assigned", "confirmed", "declined", "served"]) });

export const ReflectionSchema = z.object({
  scriptureRef: z.string().trim().max(80).nullable().optional(),
  quote: z.string().trim().max(1000).nullable().optional(),
  body: zText(10, 5000, "Nội dung suy niệm"),
});

export const ReadAllSchema = z.object({ includeAnnouncements: z.boolean().optional() });
