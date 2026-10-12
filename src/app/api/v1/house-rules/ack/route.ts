import { z } from "zod";
import { api } from "@/server/http";
import { acknowledgeHouseRules, getHouseRulesAck } from "@/server/modules/house-rules-ack";

/** Phiên bản Luật nhà hiện hành + tôi đã xác nhận chưa; người có house.rules.manage: danh sách ai đã / chưa xác nhận. */
export const GET = api({}, (ctx) => ctx.db((tx) => getHouseRulesAck(tx)));

const Body = z.object({ version: z.string().regex(/^[0-9a-f]{16}$/, "Phiên bản luật nhà không hợp lệ.") });

/** "Tôi đã đọc Luật nhà phiên bản …" — chỉ phiên bản hiện hành (409 nếu trang đang mở đã cũ). Gọi lại không đổi giờ đã xác nhận. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  return ctx.db((tx) => acknowledgeHouseRules(tx, b.version));
});
