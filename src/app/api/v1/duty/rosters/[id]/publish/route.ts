import { api, uuidParam } from "@/server/http";
import { notifyMembers, publishRoster } from "@/server/modules/duty";
import { dm } from "@/lib/duty-format";

/** Công bố roster (app.fn_publish_roster — BR-DUTY-12 đủ người tối thiểu mỗi ca). Quyền: duty.manage. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const r = await ctx.db((tx) => publishRoster(tx, id));
  await notifyMembers(
    ctx,
    r.memberIds,
    "duty.assigned",
    "Lịch trực nhật tuần mới đã công bố",
    `Tuần từ ${dm(r.weekStart)}: xem ca trực của bạn ở mục Hậu cần.`,
    { table: "duty_rosters", id }
  );
  return { ok: true, count: r.count };
});
