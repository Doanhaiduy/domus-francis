import { api } from "@/server/http";
import { bulkRegister, kdb } from "@/server/modules/kitchen";
import { BulkRegistrationSchema } from "@/server/modules/kitchen-schema";

/** scope=self-week: tự đăng ký mọi bữa còn mở của tuần; scope=all-members: Ban Ẩm thực đăng ký cho mọi người chưa đăng ký của một ngày. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(BulkRegistrationSchema);
  return kdb(ctx, (tx) => bulkRegister(tx, b));
});
