import { api } from "@/server/http";
import { assertCanImport, importLectionary, lectionaryStatus } from "@/server/modules/liturgy-lectionary";

/** Tình trạng dữ liệu Lời Chúa (số bộ bài đọc, lần nạp gần nhất, nguồn). */
export const GET = api({}, (ctx) => ctx.db((tx) => lectionaryStatus(tx)));

/** Nạp (lại) Lời Chúa từ nguồn mở — liturgy.calendar.manage. Chỉ tải dữ liệu về (GET), không gửi dữ liệu của nhà ra ngoài. */
export const POST = api({}, async (ctx) => {
  await ctx.db((tx) => assertCanImport(tx));
  const r = await importLectionary(ctx.userId, ctx.requestId);
  return { ok: true, ...r };
});
