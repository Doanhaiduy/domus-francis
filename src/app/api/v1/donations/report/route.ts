import { api } from "@/server/http";
import { DonationReportSchema, reportDonation } from "@/server/modules/donations";

/** Thành viên tự báo "tôi đã ủng hộ quỹ" (chờ Thủ quỹ xác nhận). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(DonationReportSchema);
  const id = await ctx.db((tx) => reportDonation(tx, b));
  return Response.json({ id }, { status: 201 });
});
