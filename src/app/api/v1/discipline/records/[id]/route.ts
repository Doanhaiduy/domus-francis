import { api, uuidParam } from "@/server/http";
import { RecordPatchSchema, deleteRecord, updateRecord } from "@/server/modules/discipline";

/** Sửa nội dung, hoặc action: complete (xác nhận đã chấp hành xong) · waive (miễn, cần lý do) · reopen. */
export const PATCH = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(RecordPatchSchema);
  await ctx.db((tx) => updateRecord(tx, id, b));
  return { ok: true };
});

export const DELETE = api({}, async (ctx) => {
  await ctx.db((tx) => deleteRecord(tx, uuidParam(ctx, "id")));
  return { ok: true };
});
