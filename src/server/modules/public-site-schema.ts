import "server-only";
import { z } from "zod";

/** Người ngoài báo "đã ủng hộ" ở trang /ung-ho (không cần tài khoản). website/startedAt/turnstileToken: chống spam. */
export const PublicDonationSchema = z.object({
  donorName: z.string().trim().max(120, "Tên / danh xưng tối đa 120 ký tự.").optional().nullable(),
  /** true ⇒ bỏ qua tên, ghi "Ẩn danh" */
  anonymous: z.boolean().optional(),
  amountVnd: z
    .number({ error: "Số tiền phải là số." })
    .int("Số tiền phải là số nguyên (đồng).")
    .min(1000, "Số tiền tối thiểu 1.000 đ.")
    .max(1_000_000_000, "Số tiền tối đa 1.000.000.000 đ."),
  donatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chuyển phải có dạng YYYY-MM-DD."),
  message: z.string().trim().max(300, "Lời nhắn tối đa 300 ký tự.").optional().nullable(),
  contact: z.string().trim().max(120, "Thông tin liên hệ tối đa 120 ký tự.").optional().nullable(),
  // chống spam: ô ẩn (người thật không điền) + thời điểm mở biểu mẫu + CAPTCHA tùy chọn
  website: z.string().max(200).optional(),
  startedAt: z.number().int().optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export const FaqSchema = z.object({
  question: z.string().trim().min(5, "Câu hỏi tối thiểu 5 ký tự.").max(250, "Câu hỏi tối đa 250 ký tự."),
  answer: z.string().trim().min(2, "Câu trả lời không được trống.").max(4000, "Câu trả lời tối đa 4.000 ký tự."),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
