import "server-only";
import { z } from "zod";
import { zUuid } from "../http";

const score = z
  .number({ error: "Điểm phải là số." })
  .min(0, "Điểm không được âm.")
  .max(100, "Điểm vượt thang.")
  .transform((v) => Math.round(v * 100) / 100)
  .nullable()
  .optional();

const optText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const SubjectSchema = z
  .object({
    name: z.string().trim().min(2, "Tên môn học tối thiểu 2 ký tự.").max(200, "Tên môn học tối đa 200 ký tự."),
    credits: z
      .number({ error: "Số tín chỉ phải là số." })
      .gt(0, "Số tín chỉ phải lớn hơn 0.")
      .max(15, "Số tín chỉ tối đa 15.")
      .transform((v) => Math.round(v * 10) / 10),
    processScore: score,
    finalScore: score,
    officialTotalScore: score,
  })
  .refine((s) => s.processScore != null || s.finalScore != null || s.officialTotalScore != null, {
    message: "Mỗi môn cần ít nhất một loại điểm (quá trình/giữa kỳ, cuối kỳ hoặc tổng kết chính thức).",
    path: ["finalScore"],
  });

export const RecordInputSchema = z.object({
  semesterId: zUuid,
  universityId: zUuid,
  major: optText(200, "Chuyên ngành"),
  studentCode: optText(40, "Mã số sinh viên"),
  hasScholarship: z.boolean().optional().default(false),
  scholarshipNote: optText(500, "Ghi chú học bổng"),
  subjects: z.array(SubjectSchema).min(1, "Nhập ít nhất một môn học.").max(40, "Tối đa 40 môn trong một học kỳ."),
  evidenceFileId: zUuid.nullable().optional(),
  goals: optText(2000, "Nguyện vọng / mục tiêu"),
  difficulties: optText(2000, "Khó khăn"),
  goalsVisibility: z.enum(["private", "leadership", "community"]).optional().default("leadership"),
  supportNeeded: z.boolean().optional().default(false),
  supportSubject: optText(200, "Môn cần phụ đạo"),
  submit: z.boolean().optional().default(false),
});
export type RecordInput = z.infer<typeof RecordInputSchema>;

export const ActionSchema = z.object({
  reason: z.string().trim().max(500, "Lý do tối đa 500 ký tự.").nullable().optional(),
});
