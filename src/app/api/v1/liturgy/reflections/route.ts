import { api } from "@/server/http";
import { createReflection, listReflections } from "@/server/modules/liturgy";
import { ReflectionSchema } from "@/server/modules/community-schema";

/** Góc chia sẻ Lời Chúa — bài mới nhất trước. */
export const GET = api({}, (ctx) => ctx.db((tx) => listReflections(tx, Number(ctx.query.get("limit")) || 5)));

/** Chia sẻ suy niệm (mọi thành viên — RLS reflections__insert: tác giả là chính mình). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(ReflectionSchema);
  const id = await ctx.db((tx) => createReflection(tx, b));
  return Response.json({ id }, { status: 201 });
});
