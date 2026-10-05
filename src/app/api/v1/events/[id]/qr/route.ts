import { api, uuidParam, type Ctx } from "@/server/http";
import { closeQrSession, openQrSession, qrDisplay } from "@/server/modules/events-attendance";
import { QrOpenSchema } from "@/server/modules/events-schema";

/** Gốc URL local mà người quét truy cập được (theo Host của chính request: localhost hoặc IP LAN của máy chủ). */
function origin(ctx: Ctx) {
  const host = ctx.req.headers.get("x-forwarded-host") || ctx.req.headers.get("host") || "localhost:3000";
  const proto = ctx.req.headers.get("x-forwarded-proto") || ctx.req.nextUrl.protocol.replace(":", "") || "http";
  const safeHost = /^[a-z0-9.\-:[\]]+$/i.test(host) ? host : "localhost:3000";
  return `${proto === "https" ? "https" : "http"}://${safeHost}`;
}

/** GET /api/v1/events/:id/qr — mã QR hiện tại (token xoay vòng + mã 6 số + SVG); { session: null } nếu chưa mở phiên. Quyền: điểm danh sự kiện. */
export const GET = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => (await qrDisplay(tx, id, origin(ctx))) ?? { session: null });
});

/** POST /api/v1/events/:id/qr { durationMinutes?, rotationSeconds? } — mở phiên điểm danh QR. Quyền: event.qr.manage hoặc ban tổ chức. */
export const POST = api({}, async (ctx) => {
  const id = uuidParam(ctx, "id");
  const b = await ctx.body(QrOpenSchema);
  return ctx.db(async (tx) => {
    await openQrSession(tx, id, b);
    return qrDisplay(tx, id, origin(ctx));
  });
});

/** DELETE /api/v1/events/:id/qr — đóng phiên điểm danh QR. */
export const DELETE = api({}, (ctx) => {
  const id = uuidParam(ctx, "id");
  return ctx.db(async (tx) => {
    await closeQrSession(tx, id);
    return { ok: true };
  });
});
