import { api, uuidParam } from "@/server/http";
import { getAssignment, notifyMembers, reviewAssignment } from "@/server/modules/duty";
import { ReviewSchema } from "@/server/modules/duty-schema";

/** Nghiệm thu lần check-in mới nhất: đạt (điểm 1–5) hoặc yêu cầu làm lại (nhận xét). BR-DUTY-02: không tự nghiệm thu. Quyền: duty.review. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(ReviewSchema);
  const out = await ctx.db(async (tx) => {
    const r = await reviewAssignment(tx, id, b);
    return { ...r, assignment: await getAssignment(tx, id) };
  });
  await notifyMembers(
    ctx,
    out.memberIds,
    "duty.reviewed",
    b.decision === "approved" ? "Ca trực đã được nghiệm thu đạt" : "Ca trực cần dọn lại",
    b.decision === "approved" ? `${out.label}: đạt ${b.score}/5 sao.` : `${out.label}: ${b.feedback}`,
    { table: "duty_assignments", id }
  );
  return out.assignment;
});
