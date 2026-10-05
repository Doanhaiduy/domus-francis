import "server-only";
import type { Ctx } from "../http";
import { postZaloEvent, type ZaloPostResult } from "./zalo";

// Thông báo khi có thay đổi chỗ ở: chuyển / xếp phòng, thành viên mới. Lỗi gửi không làm hỏng thao tác chính.

async function names(ctx: Pick<Ctx, "dbAs">, memberId: string, roomCode: string | null) {
  return ctx.dbAs("luuxa_worker", async (tx) => {
    const m = (await tx.query<{ n: string }>("SELECT display_name AS n FROM members WHERE id = $1", [memberId])).rows[0]?.n ?? "Một thành viên";
    const room = roomCode ? (await tx.query<{ n: string }>("SELECT COALESCE(name, code) AS n FROM rooms WHERE code = $1", [roomCode])).rows[0]?.n ?? roomCode : null;
    return { member: m, room };
  });
}

/** Xếp / chuyển phòng: báo riêng người được chuyển (trong ứng dụng) + (nếu bật) đăng nhóm Zalo. */
export async function announceRoomChange(ctx: Pick<Ctx, "dbAs"> & { userId?: string | null }, memberId: string, roomCode: string): Promise<ZaloPostResult | null> {
  try {
    const { member, room } = await names(ctx, memberId, roomCode);
    await ctx.dbAs("luuxa_worker", (tx) =>
      tx.query("SELECT app.fn_system_notify_member($1, 'system.room_changed', $2, $3, '/so-do-nha')", [memberId, `Bạn được xếp vào ${room}`, "Trưởng nhà vừa cập nhật phòng ở của bạn."]),
    );
    return await postZaloEvent(ctx, "room_change", { member, room: room ?? "" });
  } catch (e) {
    console.error("[notice] chuyển phòng lỗi:", (e as Error).message);
    return null;
  }
}

export async function announceMemberJoined(ctx: Pick<Ctx, "dbAs"> & { userId?: string | null }, memberId: string, roomCode: string | null): Promise<ZaloPostResult | null> {
  try {
    const { member, room } = await names(ctx, memberId, roomCode);
    return await postZaloEvent(ctx, "member_joined", { member, room_part: room ? `, ở ${room}` : "" });
  } catch (e) {
    console.error("[notice] thành viên mới lỗi:", (e as Error).message);
    return null;
  }
}
