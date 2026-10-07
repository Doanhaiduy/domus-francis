import { z } from "zod";
import { adminDelete } from "@/server/modules/admin-delete";
import { api, uuidParam } from "@/server/http";
import { updateInquiry } from "@/server/modules/public-site";

const Body = z.object({ status: z.enum(["new", "contacted", "visited", "accepted", "rejected", "spam"]).optional(), note: z.string().trim().max(1000).nullable().optional() });

/** Đổi trạng thái / ghi chú xử lý. */
export const PATCH = api({}, async (ctx) => {
  const b = await ctx.body(Body);
  await ctx.db((tx) => updateInquiry(tx, uuidParam(ctx, "id"), b));
  return { ok: true };
});

/** Admin dọn dữ liệu rác: xóa vĩnh viễn một đăng ký tìm hiểu (quyền data.purge). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "inquiry", uuidParam(ctx, "id"))));
