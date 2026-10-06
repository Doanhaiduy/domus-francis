import "server-only";
import { z } from "zod";
import { zDate } from "../http";

export const zMeal = z.enum(["lunch", "dinner"], { message: "Bữa ăn phải là lunch (trưa) hoặc dinner (tối)." });
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:mm (ví dụ 09:00).");
const optText = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự.`).nullable().optional();
const zQty = z.number().positive("Số lượng phải lớn hơn 0.").max(100000).nullable().optional();

export const RegistrationSchema = z.object({
  date: zDate,
  meal: zMeal,
  memberId: z.string().uuid("Mã thành viên không hợp lệ.").optional(),
  willEat: z.boolean(),
  guests: z.number().int().min(0).max(10, "Tối đa 10 khách.").optional(),
  note: optText(200),
});

export const BulkRegistrationSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("self-week"), date: zDate }),
  z.object({ scope: z.literal("all-members"), date: zDate, meals: z.array(zMeal).min(1).max(2).optional() }),
]);

const MenuMealSchema = z.object({
  title: optText(150),
  dishes: z.array(z.string().trim().min(1).max(120, "Tên món tối đa 120 ký tự.")).max(20, "Tối đa 20 món một bữa."),
  status: z.enum(["draft", "open", "closed", "served", "cancelled"]).optional(),
  costPerServing: z.number().int().min(0).max(1_000_000).nullable().optional(),
  cutoffTime: zTime.nullable().optional(),
});

export const MenuDaySchema = z
  .object({
    date: zDate,
    lunch: MenuMealSchema.optional(),
    dinner: MenuMealSchema.optional(),
    cooks: z
      .array(z.object({ memberId: z.string().uuid(), role: z.enum(["lead", "assistant", "shopper"]) }))
      .max(8, "Tối đa 8 người trực một ngày.")
      .optional(),
  })
  .refine((b) => b.lunch || b.dinner || b.cooks, { message: "Không có gì để lưu." });

export const FeedbackSchema = z.object({
  rating: z.number().int().min(1, "Chọn từ 1 đến 5 sao.").max(5, "Chọn từ 1 đến 5 sao."),
  comment: optText(1000),
});

export const SurveyCreateSchema = z.object({
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(150),
  description: optText(1000),
  maxChoices: z.number().int().min(1).max(10).default(1),
  allowSuggestions: z.boolean().default(true),
  targetWeek: zDate.nullable().optional(),
  closesOn: zDate.nullable().optional(),
  options: z.array(z.string().trim().min(2, "Tên món tối thiểu 2 ký tự.").max(120)).min(2, "Cần ít nhất 2 món để bình chọn.").max(20),
});

export const SurveyPatchSchema = z.object({ status: z.enum(["open", "closed"]) });
export const SurveyVoteSchema = z.object({ optionIds: z.array(z.string().uuid()).max(10) });
export const SurveyOptionSchema = z.object({ label: z.string().trim().min(2, "Tên món tối thiểu 2 ký tự.").max(120) });

export const MealSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  lunchCutoff: zTime.optional(),
  dinnerCutoff: zTime.optional(),
});

// ---- Kho bếp ----
export const PantryItemSchema = z.object({
  name: z.string().trim().min(2, "Tên mặt hàng tối thiểu 2 ký tự.").max(100),
  unit: z.string().trim().min(1, "Nhập đơn vị (kg, chai, gói…).").max(30),
  qtyOnHand: z.number().min(0, "Tồn kho không âm.").max(100000),
  parLevel: z.number().min(0, "Định mức không âm.").max(100000),
  icon: z.string().trim().max(8).nullable().optional(),
});
export const PantryItemPatchSchema = PantryItemSchema.partial().extend({
  delta: z.number().min(-100000).max(100000).optional(),
});

export const RestockCreateSchema = z
  .object({
    pantryItemId: z.string().uuid().nullable().optional(),
    itemName: optText(100),
    qty: zQty,
    unit: optText(30),
    note: optText(500),
  })
  .refine((b) => b.pantryItemId || (b.itemName && b.itemName.length >= 2), { message: "Chọn mặt hàng trong kho hoặc nhập tên món cần mua." });

export const RestockActionSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  note: optText(500),
  neededOn: zDate.nullable().optional(),
});

export const ShoppingCreateSchema = z
  .object({
    name: optText(100),
    qty: zQty,
    unit: optText(30),
    note: optText(500),
    pantryItemId: z.string().uuid().nullable().optional(),
    neededOn: zDate.nullable().optional(),
    estCostVnd: z.number().int().min(0).max(100_000_000).nullable().optional(),
  })
  .refine((b) => b.pantryItemId || (b.name && b.name.length >= 2), { message: "Nhập tên món cần mua." });

export const ShoppingPatchSchema = z.object({
  isPurchased: z.boolean().optional(),
  name: z.string().trim().min(2).max(100).optional(),
  qty: zQty,
  unit: optText(30),
  note: optText(500),
  neededOn: zDate.nullable().optional(),
  estCostVnd: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
