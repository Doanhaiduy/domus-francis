import { api, uuidParam } from "@/server/http";
import { checkIn, getAssignment, notifyRoles } from "@/server/modules/duty";
import { CheckinSchema } from "@/server/modules/duty-schema";
import { dm } from "@/lib/duty-format";

/**
 * Check-in ca trực: duty_checkins + checkin_items + media_attachments trong MỘT transaction.
 * DB kiểm: người trực (BR-DUTY-01), khung giờ (BR-DUTY-08) / hạn làm lại (BR-DUTY-26), ảnh hợp lệ & không tái sử dụng
 * (BR-DUTY-03, ux_duty_checkins__evidence), đủ tiêu chí bắt buộc (BR-DUTY-09). Quyền: duty.checkin, chỉ cho chính mình (RLS).
 */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(CheckinSchema);
  const out = await ctx.db(async (tx) => {
    const r = await checkIn(tx, id, b);
    return { ...r, assignment: await getAssignment(tx, id) };
  });
  const a = out.assignment;
  await notifyRoles(
    ctx,
    ["house_head", "vice_head"],
    "duty.review_needed",
    "Ca trực chờ nghiệm thu",
    `${a.area.name} · ${a.shift.label} ${dm(a.date)} — ${a.members.map((m) => m.name).join(", ")} đã gửi ảnh minh chứng.`,
    { table: "duty_assignments", id },
    out.memberIds
  );
  return a;
});
