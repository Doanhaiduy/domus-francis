import { api, uuidParam } from "@/server/http";
import { DonationActionSchema, actOnDonation } from "@/server/modules/donations";

/** confirm (đã nhận tiền, cần fundId) · reject (kèm lý do) · cancel (hủy khoản mới hứa/đang chờ) — cần finance.contribution.record; withdraw — chính thành viên rút lại khoản mình báo. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(DonationActionSchema);
  await ctx.db((tx) => actOnDonation(tx, id, b));
  return { ok: true };
});
