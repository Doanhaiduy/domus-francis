import { api, uuidParam } from "@/server/http";
import { adminDelete } from "@/server/modules/admin-delete";
import { getExpense, updateExpense } from "@/server/modules/finance-expenses";
import { UpdateExpenseSchema } from "@/server/modules/finance-schema";

export const GET = api({}, (ctx) => ctx.db((tx) => getExpense(tx, uuidParam(ctx, "id"))));

/** Người lập sửa phiếu nháp / bị từ chối / đang chờ duyệt (tự rút về nháp), tùy chọn nộp lại. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(UpdateExpenseSchema);
  return ctx.db(async (tx) => {
    await updateExpense(tx, id, b);
    return getExpense(tx, id);
  });
});

/** Admin dọn dữ liệu rác: xóa vĩnh viễn phiếu chi ĐÃ HỦY (quyền data.purge; phiếu đã chi không xóa được — dùng đảo). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "expense", uuidParam(ctx, "id"))));
