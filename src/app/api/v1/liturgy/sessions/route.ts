import { api } from "@/server/http";
import { createSession } from "@/server/modules/liturgy";
import { SessionSchema } from "@/server/modules/community-schema";

/** Thêm buổi phụng vụ (sự kiện danh mục Phụng vụ & Thánh lễ) — liturgy.manage + event.manage (RLS). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(SessionSchema);
  const id = await ctx.db((tx) => createSession(tx, b));
  return Response.json({ id }, { status: 201 });
});
