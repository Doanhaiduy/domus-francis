import "server-only";
import type { Tx } from "../db";
import { withTx } from "../db";
import { ApiError, forbidden } from "../errors";
import { buildLectionary, type LectionarySources } from "../liturgy/lectionary-build";
import type { LectionaryRef } from "@/lib/liturgy/engine";
import type { LectionaryStatusDto, ReadingSetDto, ReadingSlotDto } from "@/lib/types/liturgy";

// ---------------------------------------------------------------------
// Sách Bài Đọc: nạp một lần từ dữ liệu mở trên GitHub vào bảng liturgy_lectionary (chỉ ĐỌC từ Internet — yêu cầu GET,
// không gửi dữ liệu nào của nhà ra ngoài), sau đó mọi trang tra trong CSDL. Nguồn ghim theo commit để nội dung không đổi bất ngờ.
//   LITURGY_DATA_BASE_URL — đổi nguồn (vd. bản sao nội bộ; kiểm thử dùng máy chủ giả loopback)
//   LITURGY_OFFLINE=1     — chặn mọi lệnh tải từ Internet
// ---------------------------------------------------------------------
export const DEFAULT_LECTIONARY_BASE = "https://raw.githubusercontent.com/anrevietson/myCalLiturgy/0a3e86fd87fcd277768314a2031593df8a92986a";
const FILES: Record<keyof LectionarySources, string> = {
  readingdata: "Reading/readingdata.js",
  sunday: "Reading/Sunday.js",
  season: "Reading/DailySeason.js",
  ord1: "Reading/DailyOrdinary1.js",
  ord2: "Reading/DailyOrdinary2.js",
  saints: "Reading/SaintsBible.js",
  optional: "Reading/Optionsaint.js",
};

export const lectionaryBase = () => (process.env.LITURGY_DATA_BASE_URL || DEFAULT_LECTIONARY_BASE).replace(/\/+$/, "");
export const lectionaryOffline = () => process.env.LITURGY_OFFLINE === "1";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: "text/plain, application/javascript, */*" } });
  if (!res.ok) throw new Error(`Không tải được ${url.split("/").pop()} (HTTP ${res.status}).`);
  const text = await res.text();
  if (text.length > 8 * 1024 * 1024) throw new Error(`Tệp ${url.split("/").pop()} lớn bất thường — đã dừng.`);
  return text;
}

let running: Promise<{ entries: number; withText: number }> | null = null;

/** Tải nguồn + dựng + ghi vào CSDL (vai trò luuxa_worker). Gọi đồng thời ⇒ dùng chung một lần chạy. */
export function importLectionary(requestedBy: string | null, requestId: string): Promise<{ entries: number; withText: number }> {
  if (running) return running;
  running = (async () => {
    if (lectionaryOffline()) throw new ApiError(503, "LITURGY_OFFLINE", "Máy chủ đang đặt chế độ không tải dữ liệu từ Internet (LITURGY_OFFLINE=1).");
    const base = lectionaryBase();
    const logId = await withTx({ requestId }, "luuxa_worker", async (tx) =>
      (
        await tx.query<{ id: string }>(
          "INSERT INTO liturgy_lectionary_imports (requested_by, source) VALUES ($1, $2::jsonb) RETURNING id",
          [requestedBy, JSON.stringify({ base, files: Object.values(FILES) })]
        )
      ).rows[0].id
    );
    try {
      const src = Object.fromEntries(
        await Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, await fetchText(`${base}/${f}`)] as const))
      ) as unknown as LectionarySources;
      const { entries, stats } = buildLectionary(src);
      if (entries.length < 100) throw new Error(`Dữ liệu tải về chỉ có ${entries.length} bộ bài đọc — có thể nguồn đã đổi định dạng.`);
      await withTx({ requestId }, "luuxa_worker", async (tx) => {
        await tx.query("DELETE FROM liturgy_lectionary");
        // Ghi theo lô ~150 dòng (mỗi tham số vài trăm KB)
        for (let i = 0; i < entries.length; i += 150) {
          const chunk = entries.slice(i, i + 150).map((e) => ({ key: e.key, cycle: e.cycle, variant: e.variant, source_code: e.sourceCode, slots: e.slots }));
          await tx.query(
            `INSERT INTO liturgy_lectionary (key, cycle, variant, source_code, slots)
             SELECT r.key, r.cycle, r.variant, r.source_code, r.slots
               FROM jsonb_to_recordset($1::jsonb) AS r(key text, cycle text, variant text, source_code text, slots jsonb)
             ON CONFLICT (key, cycle, variant) DO UPDATE SET slots = EXCLUDED.slots, source_code = EXCLUDED.source_code, updated_at = now()`,
            [JSON.stringify(chunk)]
          );
        }
        await tx.query("UPDATE liturgy_lectionary_imports SET status = 'succeeded', finished_at = now(), stats = $2::jsonb WHERE id = $1", [
          logId,
          JSON.stringify(stats),
        ]);
      });
      return { entries: stats.entries, withText: stats.withText };
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 500) || "Lỗi không xác định.";
      await withTx({ requestId }, "luuxa_worker", (tx) =>
        tx.query("UPDATE liturgy_lectionary_imports SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1", [logId, msg])
      ).catch(() => undefined);
      throw e instanceof ApiError ? e : new ApiError(502, "LECTIONARY_IMPORT_FAILED", `Nạp Lời Chúa thất bại: ${msg}`);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function lectionaryStatus(tx: Tx): Promise<LectionaryStatusDto> {
  const [count, last, perm] = await Promise.all([
    tx.query<{ n: string }>("SELECT count(*) AS n FROM liturgy_lectionary"),
    tx.query("SELECT status, started_at, finished_at, error, stats FROM liturgy_lectionary_imports ORDER BY started_at DESC LIMIT 1"),
    tx.query<{ ok: boolean }>("SELECT app.has_permission('liturgy.calendar.manage') AS ok"),
  ]);
  const l = last.rows[0];
  return {
    entries: Number(count.rows[0].n),
    lastImport: l
      ? {
          status: l.status,
          startedAt: new Date(l.started_at).toISOString(),
          finishedAt: l.finished_at ? new Date(l.finished_at).toISOString() : null,
          error: l.error ?? null,
          stats: l.stats ?? {},
        }
      : null,
    source: lectionaryBase().replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/.*$/, "github.com/$1"),
    canImport: !!perm.rows[0]?.ok,
  };
}

export async function assertCanImport(tx: Tx) {
  const ok = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('liturgy.calendar.manage') AS ok")).rows[0]?.ok;
  if (!ok) throw forbidden("Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được nạp dữ liệu Lời Chúa.");
}

interface LectRow {
  key: string;
  cycle: string;
  variant: string;
  slots: ReadingSlotDto[];
}

/** Tra các bộ bài đọc theo khóa của bộ tính lịch (ưu tiên đúng năm A/B/C – I/II, sau đó bản không phân năm). */
export async function loadReadingSets(tx: Tx, refs: LectionaryRef[]): Promise<ReadingSetDto[]> {
  if (!refs.length) return [];
  const rows = (await tx.query<LectRow>("SELECT key, cycle, variant, slots FROM liturgy_lectionary WHERE key = ANY($1::text[])", [[...new Set(refs.map((r) => r.key))]])).rows;
  return pickSets(rows, refs);
}

export function pickSets(rows: LectRow[], refs: LectionaryRef[]): ReadingSetDto[] {
  const out: ReadingSetDto[] = [];
  for (const ref of refs) {
    const same = rows.filter((r) => r.key === ref.key);
    const hit = same.find((r) => r.cycle === ref.cycle) ?? same.find((r) => r.cycle === "") ?? same[0];
    if (hit) out.push({ key: ref.key, cycle: hit.cycle, label: ref.label ?? null, slots: hit.slots });
  }
  return out;
}

/** Chỉ lấy trích dẫn Tin Mừng cho nhiều khóa (lịch tháng) — nhẹ, không kéo toàn văn. */
export async function loadGospelRefs(tx: Tx, refs: LectionaryRef[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const keys = [...new Set(refs.map((r) => r.key))];
  if (!keys.length) return out;
  const rows = (
    await tx.query<{ key: string; cycle: string; ref: string | null }>(
      `SELECT l.key, l.cycle, (SELECT s->>'ref' FROM jsonb_array_elements(l.slots) s WHERE s->>'kind' = 'gospel' LIMIT 1) AS ref
         FROM liturgy_lectionary l WHERE l.key = ANY($1::text[])`,
      [keys]
    )
  ).rows;
  for (const ref of refs) {
    const same = rows.filter((r) => r.key === ref.key);
    const hit = same.find((r) => r.cycle === ref.cycle) ?? same.find((r) => r.cycle === "") ?? same[0];
    if (hit?.ref) out.set(`${ref.key}|${ref.cycle}`, hit.ref);
  }
  return out;
}

/** Job nền: CSDL chưa có Lời Chúa ⇒ thử nạp (mỗi lần khởi động + mỗi ngày), trừ khi LITURGY_AUTO_IMPORT=0 / LITURGY_OFFLINE=1. */
export async function autoImportLectionary() {
  if (process.env.LITURGY_AUTO_IMPORT === "0" || lectionaryOffline()) return;
  const n = await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) =>
    Number((await tx.query<{ n: string }>("SELECT count(*) AS n FROM liturgy_lectionary")).rows[0].n)
  );
  if (n > 0) return;
  const r = await importLectionary(null, crypto.randomUUID());
  console.log(`[jobs] Đã nạp Lời Chúa: ${r.entries} bộ bài đọc (${r.withText} có toàn văn).`);
}
