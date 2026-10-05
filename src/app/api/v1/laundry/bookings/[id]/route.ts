import { api, uuidParam } from "@/server/http";
import { setLaundryStatus } from "@/server/modules/facilities";
import { LaundryActionSchema } from "@/server/modules/duty-schema";

/** Bắt đầu giặt (checkin, từ 10 phút trước giờ) / giặt xong (complete) — lượt của chính mình hoặc laundry.manage. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(LaundryActionSchema);
  await ctx.db((tx) => setLaundryStatus(tx, uuidParam(ctx, "id"), b.action === "checkin" ? "checked_in" : "completed", null));
  return { ok: true };
});

/** Hủy lượt đã đặt (BR-LAU-04: trước giờ bắt đầu ≥ 30 phút, trừ laundry.manage). */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => setLaundryStatus(tx, uuidParam(ctx, "id"), "cancelled", ctx.query.get("reason") || "Người đặt tự hủy"));
  return { ok: true };
});
