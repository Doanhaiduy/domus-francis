import { api } from "@/server/http";
import { errorMessageOf } from "@/server/modules/academic-http";
import { createRecord, getRecord, listRecords, transition } from "@/server/modules/academic";
import { RecordInputSchema } from "@/server/modules/academic-schema";
import type { SaveRecordResult } from "@/lib/types/academic";

/** Bảng điểm người gọi nhìn thấy được (RLS: của mình; lãnh đạo thấy bảng điểm đã nộp/xác minh khi chủ thể đồng ý). */
export const GET = api({}, (ctx) => ctx.db((tx) => listRecords(tx)));

/** Tạo bảng điểm của chính mình (nháp); submit = true thì nộp ngay sau khi lưu (nộp lỗi vẫn giữ bản nháp). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(RecordInputSchema);
  const id = await ctx.db((tx) => createRecord(tx, b));
  let submitError: string | undefined;
  if (b.submit) {
    try {
      await ctx.db((tx) => transition(tx, id, "submit", null));
    } catch (e) {
      submitError = errorMessageOf(e);
    }
  }
  const record = await ctx.db((tx) => getRecord(tx, id));
  return Response.json({ record, submitError } satisfies SaveRecordResult, { status: 201 });
});
