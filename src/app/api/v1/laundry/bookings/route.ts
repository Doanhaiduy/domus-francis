import { api } from "@/server/http";
import { bookLaundry } from "@/server/modules/facilities";
import { LaundryBookSchema } from "@/server/modules/duty-schema";

/**
 * Đặt một khung giờ giặt cho chính mình (laundry.book). DB kiểm khung giờ cấu hình (BR-LAU-01), không đặt quá khứ/quá xa (BR-LAU-02),
 * hạn mức lượt/tuần (BR-LAU-03); trùng máy ⇒ EXCLUDE ex_laundry_bookings__no_overlap ⇒ 409.
 */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(LaundryBookSchema);
  const id = await ctx.db((tx) => bookLaundry(tx, b));
  return Response.json({ id }, { status: 201 });
});
