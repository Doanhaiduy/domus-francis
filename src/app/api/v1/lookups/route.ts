import { api } from "@/server/http";
import type { LookupDto } from "@/lib/types/members";

export const GET = api({}, (ctx) =>
  ctx.db(async (tx): Promise<LookupDto> => ({
    universities: (await tx.query("SELECT id, code, name FROM universities WHERE deleted_at IS NULL ORDER BY name")).rows,
    dioceses: (await tx.query("SELECT id, code, name FROM dioceses ORDER BY sort_order")).rows,
  }))
);
