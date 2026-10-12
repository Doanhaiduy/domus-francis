import { api, uuidParam } from "@/server/http";
import { adminDelete } from "@/server/modules/admin-delete";
import { getExpense, updateExpense } from "@/server/modules/finance-expenses";
import { UpdateExpenseSchema } from "@/server/modules/finance-schema";
import { notifyExpense } from "@/server/modules/finance-notify";

export const GET = api({}, (ctx) => ctx.db((tx) => getExpense(tx, uuidParam(ctx, "id"))));

/**
 * Người lập sửa phiếu nháp / bị từ chối / đang chờ duyệt (tự rút về nháp), tùy chọn nộp lại.
 * Nộp lại ⇒ báo người còn ký được; phiếu đang chờ duyệt bị rút về nháp để sửa ⇒ báo người ứng tiền.
 */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(UpdateExpenseSchema);
  const { out, before } = await ctx.db(async (tx) => {
    const before = (await tx.query<{ s: string }>("SELECT status::text AS s FROM expense_vouchers WHERE id = $1", [id])).rows[0]?.s ?? null;
    await updateExpense(tx, id, b);
    return { out: await getExpense(tx, id), before };
  });
  if (out.status === "pending_approval" && b.submit) await notifyExpense(ctx, id, "submitted");
  else if (before === "pending_approval" && out.status === "draft") await notifyExpense(ctx, id, "withdrawn");
  return out;
});

/** Admin dọn dữ liệu rác: xóa vĩnh viễn phiếu chi ĐÃ HỦY (quyền data.purge; phiếu đã chi không xóa được — dùng đảo). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "expense", uuidParam(ctx, "id"))));
