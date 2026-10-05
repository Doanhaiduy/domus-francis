import { api } from "@/server/http";
import { upcomingFeasts } from "@/server/modules/liturgy-calendar";

/** GET ?days=45 — lễ trọng, Tết, lễ Bổn mạng và ngày đặc biệt sắp tới (dải nhắc trên trang Lịch và trang chủ). */
export const GET = api({}, (ctx) => ctx.db((tx) => upcomingFeasts(tx, Number(ctx.query.get("days")) || 45)));
