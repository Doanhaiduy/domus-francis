import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { listLeaveAll } from "@/server/modules/leave";
import type { LeaveKind, LeaveStatus } from "@/lib/types/leave";

const STATUSES: LeaveStatus[] = ["pending", "approved", "rejected", "cancelled"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Toàn bộ đơn xin phép (mọi trạng thái, mọi thời gian) — người có leave.review. Lọc: status, kind, q, from, to; limit (tối đa 200). */
export const GET = api({}, (ctx) => {
  const status = ctx.query.get("status") ?? "";
  const kind = ctx.query.get("kind") ?? "";
  const from = ctx.query.get("from") ?? "";
  const to = ctx.query.get("to") ?? "";
  if (status && !STATUSES.includes(status as LeaveStatus)) throw badRequest("Trạng thái không hợp lệ.");
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) throw badRequest("Ngày lọc phải dạng YYYY-MM-DD.");
  const limit = Number(ctx.query.get("limit") ?? 30);
  return ctx.db((tx) =>
    listLeaveAll(tx, {
      status: (status || undefined) as LeaveStatus | undefined,
      kind: (kind || undefined) as LeaveKind | undefined,
      q: ctx.query.get("q") ?? undefined,
      from: from || undefined,
      to: to || undefined,
      limit: Number.isFinite(limit) ? limit : 30,
    })
  );
});
