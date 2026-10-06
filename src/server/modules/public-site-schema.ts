import "server-only";
import { z } from "zod";

export const FaqSchema = z.object({
  question: z.string().trim().min(5, "Câu hỏi tối thiểu 5 ký tự.").max(250, "Câu hỏi tối đa 250 ký tự."),
  answer: z.string().trim().min(2, "Câu trả lời không được trống.").max(4000, "Câu trả lời tối đa 4.000 ký tự."),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
