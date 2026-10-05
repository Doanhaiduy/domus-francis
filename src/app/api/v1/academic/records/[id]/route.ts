import { api, uuidParam } from "@/server/http";
import { errorMessageOf } from "@/server/modules/academic-http";
import { deleteRecord, getRecord, transition, updateRecord } from "@/server/modules/academic";
import { RecordInputSchema } from "@/server/modules/academic-schema";
import type { SaveRecordResult } from "@/lib/types/academic";

export const GET = api({}, (ctx) => ctx.db((tx) => getRecord(tx, uuidParam(ctx, "id"))));

/** Sửa bảng điểm của chính mình khi còn nháp/bị trả lại (thay toàn bộ danh sách môn). */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RecordInputSchema);
  await ctx.db((tx) => updateRecord(tx, id, b));
  let submitError: string | undefined;
  if (b.submit) {
    try {
      await ctx.db((tx) => transition(tx, id, "submit", null));
    } catch (e) {
      submitError = errorMessageOf(e);
    }
  }
  const record = await ctx.db((tx) => getRecord(tx, id));
  return { record, submitError } satisfies SaveRecordResult;
});

/** Xóa bảng điểm nháp/bị trả lại của chính mình. */
export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteRecord(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
