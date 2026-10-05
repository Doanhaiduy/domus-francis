import "server-only";
import { z } from "zod";
import { CATEGORY_KINDS } from "@/lib/types/settings";

const zKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Khóa cấu hình không hợp lệ.");

export const SettingsPatchSchema = z.object({
  changes: z
    .array(
      z.object({
        key: zKey,
        value: z.unknown().refine((v) => v !== undefined, "Thiếu giá trị cấu hình."),
        version: z.number().int().min(1).optional(),
      }),
    )
    .min(1, "Không có thay đổi nào để lưu.")
    .max(100, "Quá nhiều thay đổi trong một lần lưu."),
});

export const SettingPutSchema = z.object({
  value: z.unknown().refine((v) => v !== undefined, "Thiếu giá trị cấu hình."),
  version: z.number().int().min(1).optional(),
});

export const SettingsResetSchema = z.object({
  keys: z.array(zKey).min(1, "Chọn ít nhất một cấu hình để khôi phục.").max(100),
});

const zCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Mã danh mục tối thiểu 2 ký tự.")
      .max(40, "Mã danh mục tối đa 40 ký tự.")
      .regex(/^[A-Z][A-Z0-9_]*$/, "Mã danh mục chỉ gồm chữ in hoa không dấu, số và dấu gạch dưới, bắt đầu bằng chữ (VD: FOOD_VEG)."),
  );

export const CategoryCreateSchema = z.object({
  kind: z.enum(CATEGORY_KINDS, { message: "Phân hệ áp dụng không hợp lệ." }),
  code: zCode,
  name: z.string().trim().min(1, "Nhập tên danh mục.").max(100, "Tên danh mục tối đa 100 ký tự."),
  description: z.string().trim().max(500, "Mô tả tối đa 500 ký tự.").nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Màu phải là mã hex dạng #RRGGBB.")
    .optional(),
  isActive: z.boolean().optional(),
});

export const CategoryUpdateSchema = CategoryCreateSchema.partial().extend({
  version: z.number().int().min(1).optional(),
});
