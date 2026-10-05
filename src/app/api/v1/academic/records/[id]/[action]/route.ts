import { api, uuidParam } from "@/server/http";
import { notFound } from "@/server/errors";
import { getRecord, transition } from "@/server/modules/academic";
import { ActionSchema } from "@/server/modules/academic-schema";
import type { AcademicAction } from "@/lib/types/academic";

const ACTIONS: ReadonlySet<AcademicAction> = new Set(["submit", "withdraw", "verify", "reject", "reopen"]);

/**
 * POST /api/v1/academic/records/:id/{submit|withdraw|verify|reject|reopen}
 *   submit/withdraw: chính chủ · verify: academic.verify (RLS + trigger BR-ACAD-02)
 *   reject/reopen: academic.verify qua app.fn_academic_review — body { reason } (trả lại cần ≥ 5 ký tự)
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const action = ctx.params.action as AcademicAction;
  if (!ACTIONS.has(action)) throw notFound();
  const { reason } = await ctx.body(ActionSchema);
  return ctx.db(async (tx) => {
    await transition(tx, id, action, reason ?? null);
    // Sau khi trả lại/mở lại, người xác minh không còn thấy bảng điểm (RLS) ⇒ trả về null
    return { record: await getRecord(tx, id).catch(() => null) };
  });
});
