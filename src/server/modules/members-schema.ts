import "server-only";
import { z } from "zod";
import { zDate } from "../http";

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const phone = z.string().trim().max(20).regex(/^[+\d\s.()-]*$/, "Số điện thoại không hợp lệ.").nullable().optional();

export const MemberProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(120).optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
  gender: z.enum(["Nam", "Nữ"]).nullable().optional(),
  phone,
  email: z.union([z.literal(""), z.string().trim().email("Email không hợp lệ.").max(200)]).nullable().optional()
    .transform((v) => (v === "" ? null : v)),
  hidePhone: z.boolean().optional(),
  avatarFileId: z.string().uuid().nullable().optional(),
  joinedOn: zDate.optional(),
  birthDate: zDate.nullable().optional(),
  hometown: opt(200),
  homeAddress: opt(300),
  nationalId: z.string().trim().max(20).nullable().optional(),
  fatherName: opt(120),
  fatherPhone: phone,
  motherName: opt(120),
  motherPhone: phone,
  holyName: opt(80),
  dioceseId: z.string().uuid().nullable().optional(),
  parish: opt(150),
  pastor: opt(150),
  sacraments: z.array(z.string().max(40)).max(7).optional(),
  universityId: z.string().uuid().nullable().optional(),
  major: opt(200),
  academicYear: opt(60),
  enrollmentYear: z.number().int().min(1990, "Năm nhập học không hợp lệ.").max(2100, "Năm nhập học không hợp lệ.").nullable().optional(),
  expectedGraduationYear: z.number().int().min(1990, "Năm ra trường không hợp lệ.").max(2110, "Năm ra trường không hợp lệ.").nullable().optional(),
  studentCode: opt(30),
  studentStatus: z.enum(["studying", "graduated", "suspended", "dropped_out"]).nullable().optional(),
  customDuesVnd: z.number().int().min(0).max(50_000_000).nullable().optional(),
});

export const CreateMemberSchema = MemberProfileSchema.extend({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(120),
  roomCode: z.string().trim().max(14).nullable().optional(),
  role: z.string().max(40).optional(),
  createAccount: z.boolean().optional(),
});
