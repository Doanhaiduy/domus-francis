import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { createMemberProfile, listMembers } from "@/server/modules/members";
import { CreateMemberSchema } from "@/server/modules/members-schema";
import { assignRoom } from "@/server/modules/house";
import { insertAccountInTx, prepareAccount, setMemberRole } from "@/server/modules/accounts";

const ROLE_BY_LABEL: Record<string, string> = { "Trưởng nhà": "house_head", "Thủ quỹ": "treasurer", Admin: "admin" };

export const GET = api({}, (ctx) => ctx.db((tx) => listMembers(tx, { includeFormer: ctx.query.get("includeFormer") === "1" })));

/** Thêm thành viên trực tiếp (không qua đơn): hồ sơ + phân phòng (tùy chọn) + tài khoản (tùy chọn) + vai trò. */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(CreateMemberSchema);
  const { roomCode, role, createAccount, ...profile } = b;
  if (createAccount && !b.email) throw new ApiError(400, "EMAIL_REQUIRED", "Cần email để cấp tài khoản đăng nhập.");
  const account = createAccount && b.email ? await prepareAccount(b.email) : null;
  // Một transaction: tài khoản (nếu có) → hồ sơ kèm user_id → phân phòng; lỗi bất kỳ bước nào ⇒ không còn gì dở dang
  const id = await ctx.db(async (tx) => {
    const userId = account ? await insertAccountInTx(tx, ctx.userId!, account) : null;
    const memberId = await createMemberProfile(tx, { ...profile, userId });
    if (roomCode && roomCode !== "Chưa xếp phòng") await assignRoom(tx, memberId, roomCode, "Thành viên mới");
    return memberId;
  });
  const code = account && role ? ROLE_BY_LABEL[role] : undefined;
  if (code) await setMemberRole(ctx, id, code, true);
  return Response.json({ id, account: account ? { email: account.email, temporaryPassword: account.temporaryPassword } : null }, { status: 201 });
});
