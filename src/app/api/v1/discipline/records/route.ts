import { api } from "@/server/http";
import { RecordCreateSchema, createRecord, listRecords, notifyDisciplineRecorded } from "@/server/modules/discipline";
import type { DisciplinePhase } from "@/lib/types/discipline";

const PHASES = new Set(["recorded", "upcoming", "serving", "overdue", "completed", "waived", "active"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Danh sách vi phạm kèm tổng hợp. Thành viên chỉ thấy của chính mình (RLS); discipline.read/manage thấy cả nhà.
 * Lọc: ?memberId= &from= &to= (ngày vi phạm) &phase= (active|overdue|serving|…) &q= &mine=1
 */
export const GET = api({}, (ctx) => {
  const p = ctx.query;
  const memberId = p.get("memberId");
  const from = p.get("from");
  const to = p.get("to");
  const phase = p.get("phase") ?? "";
  return ctx.db((tx) =>
    listRecords(tx, {
      memberId: memberId && UUID.test(memberId) ? memberId : undefined,
      from: from && YMD.test(from) ? from : undefined,
      to: to && YMD.test(to) ? to : undefined,
      phase: PHASES.has(phase) ? (phase as DisciplinePhase | "active") : "",
      q: (p.get("q") ?? "").slice(0, 80),
      mine: p.get("mine") === "1",
    })
  );
});

/** Ghi nhận vi phạm (discipline.manage) + báo thành viên đó. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RecordCreateSchema);
  const r = await ctx.db((tx) => createRecord(tx, b));
  await notifyDisciplineRecorded(ctx, r.id);
  return Response.json({ id: r.id }, { status: 201 });
});
