import { api, uuidParam } from "@/server/http";
import { resetUserMfa } from "@/server/modules/accounts";

/** Gỡ xác thực 2 bước của một tài khoản (người mất điện thoại) — Trưởng nhà/Admin. */
export const DELETE = api({}, (ctx) => resetUserMfa(ctx, { userId: uuidParam(ctx, "userId") }));
