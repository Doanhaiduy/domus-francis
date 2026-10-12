import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { clientIp } from "@/server/http";
import { hashKey, rateLimit, recordErrorEvent } from "@/server/ops";
import { cspMessage, isNoiseViolation, parseCspReports } from "@/server/modules/public-site-csp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;
const MAX_PER_REQUEST = 5;
const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/**
 * Trình duyệt gửi báo cáo vi phạm Content-Security-Policy-Report-Only (middleware đặt `report-uri` + `report-to` trỏ về đây).
 * Nhận cả `application/csp-report` (report-uri, Firefox/Safari) lẫn `application/reports+json` (Reporting API, Chrome/Edge).
 * Ghi vào nhật ký lỗi đã gộp (error_events, nguồn "csp" — Admin xem ở Cài đặt → Hệ thống). Giới hạn trong CSDL theo IP băm
 * (20 lần / 10 phút) và toàn hệ thống (300 / giờ); vượt thì lặng lẽ bỏ qua. Luôn trả 204 — không bao giờ làm phiền trình duyệt.
 * Route thường (không bọc api()): không đọc phiên, không ghi nhật ký hoạt động cho mỗi lần trình duyệt tự gửi báo cáo.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return new Response(null, { status: 413 });
    const raw = await req.text();
    if (!raw || raw.length > MAX_BYTES) return raw ? new Response(null, { status: 413 }) : done();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    const violations = parseCspReports(body).filter((v) => !isNoiseViolation(v)).slice(0, MAX_PER_REQUEST);
    if (!violations.length) return done();

    const ip = clientIp(req);
    const allowed = (await rateLimit(null, `csp:${hashKey("ip", ip ?? "?")}`, 600, 20)) && (await rateLimit(null, "csp:all", 3600, 300));
    if (!allowed) return done();

    const requestId = randomUUID();
    for (const v of violations) {
      await recordErrorEvent({ source: "csp", route: v.route, code: v.directive.slice(0, 60), message: cspMessage(v), requestId });
    }
    return done();
  } catch (e) {
    console.error("[csp-report] lỗi:", (e as Error)?.message);
    return done();
  }
}
