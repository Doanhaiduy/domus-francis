import { api, uuidParam } from "@/server/http";
import { MemberPaymentAccountSchema } from "@/server/modules/finance-schema";
import { deleteMemberPaymentAccount, getMemberPaymentAccount, saveMemberPaymentAccount } from "@/server/modules/payment-accounts";

/** Tài khoản nhận tiền (STK + ảnh QR) của một thành viên — ai có quyền xem danh bạ đều xem được (để chuyển khoản / hoàn ứng). */
export const GET = api({}, (ctx) => ctx.db((tx) => getMemberPaymentAccount(tx, uuidParam(ctx, "id"))));

/** Khai báo / sửa — chính chủ hoặc người có quyền sửa hồ sơ thành viên (member.update); người khác ⇒ 403. */
export const PUT = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(MemberPaymentAccountSchema);
  return ctx.db((tx) => saveMemberPaymentAccount(tx, id, b));
});

/** Xóa tài khoản nhận tiền — chính chủ hoặc member.update. */
export const DELETE = api({}, (ctx) => ctx.db((tx) => deleteMemberPaymentAccount(tx, uuidParam(ctx, "id"))));
