import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs, type DailySlot } from "@/server/cron/daily";
import { dispatchPendingPush } from "@/server/push";
import { runStorageMonitor } from "@/server/cron/storage-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron gọi (vercel.json → crons). Vercel tự gắn "Authorization: Bearer $CRON_SECRET" khi biến môi trường CRON_SECRET được đặt.
 * Chưa đặt CRON_SECRET ⇒ từ chối (tránh ai đó gọi bừa để kích hoạt gửi tin).
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
      const notes = await runStorageMonitor(today);
      await dispatchPendingPush();
      return NextResponse.json({ ok: true, only: "storage", date: today, notes });
    }
    const r = await runDailyJobs(slot);
    // Thông báo phát sinh trong lượt chạy (và thông báo đang chờ hết giờ yên tĩnh) được gửi đẩy luôn
    await dispatchPendingPush();
    return NextResponse.json({ ok: true, slot, date: r.date, items: r.items.map((i) => ({ key: i.key, status: i.status, reason: i.reason })), notes: r.notes });
  } catch (e) {
    console.error("[cron] daily lỗi:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
