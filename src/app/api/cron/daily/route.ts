import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs, type DailySlot } from "@/server/cron/daily";
import { dispatchOutbox } from "@/server/outbox";
import { runStorageMonitor } from "@/server/cron/storage-monitor";
import { finishJobRun, recordErrorEvent, startJobRun } from "@/server/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron gọi (vercel.json → crons). Vercel tự gắn "Authorization: Bearer $CRON_SECRET" khi biến môi trường CRON_SECRET được đặt.
 * Chưa đặt CRON_SECRET ⇒ từ chối (tránh ai đó gọi bừa để kích hoạt gửi tin).
 * Có bước lỗi ⇒ trả 500 (lượt chạy hiện "lỗi" trong Vercel → Cron Jobs) — chi tiết ở Cài đặt → Hệ thống (job_runs).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình trên máy chủ." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slot: DailySlot = req.nextUrl.searchParams.get("slot") === "evening" ? "evening" : "morning";
  try {
    // ?only=storage: chỉ chạy bước đo dung lượng (ghi ảnh chụp hằng ngày + báo Admin khi chạm ngưỡng) — dùng khi kiểm thử / chạy tay
    if (req.nextUrl.searchParams.get("only") === "storage") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const runId = await startJobRun("cron:storage");
      const t0 = Date.now();
      try {
        const notes = await runStorageMonitor(today);
        await finishJobRun(runId, { ok: true, steps: [{ name: "storage-monitor", ok: true, ms: Date.now() - t0, info: notes }] });
        await dispatchOutbox(15_000);
        return NextResponse.json({ ok: true, only: "storage", date: today, notes });
      } catch (e) {
        await finishJobRun(runId, { ok: false, steps: [{ name: "storage-monitor", ok: false, ms: Date.now() - t0, error: (e as Error).message }] });
        throw e;
      }
    }
    const r = await runDailyJobs(slot);
    // Thông báo phát sinh trong lượt chạy (và thông báo đang chờ hết giờ yên tĩnh) được gửi đẩy/email luôn — xả hết hàng đợi trong ~15 giây
    const sent = await dispatchOutbox(15_000);
    return NextResponse.json(
      { ok: r.ok, slot, date: r.date, steps: r.steps, items: r.items.map((i) => ({ key: i.key, status: i.status, reason: i.reason })), notes: r.notes, outbox: sent },
      { status: r.ok ? 200 : 500 },
    );
  } catch (e) {
    console.error("[cron] daily lỗi:", (e as Error).message);
    await recordErrorEvent({ source: "cron", route: `GET /api/cron/daily?slot=${slot}`, code: "CRON_FAILED", message: (e as Error).message });
    return NextResponse.json({ ok: false, error: "Tác vụ hằng ngày lỗi — xem Cài đặt → Hệ thống." }, { status: 500 });
  }
}
