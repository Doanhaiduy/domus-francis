import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { batch, type Tx } from "../db";
import type { Ctx } from "../http";
import { ApiError, forbidden, notFound } from "../errors";
import { notifyAdminsOnce, scrubMessage } from "../ops";
import { providerConfigs } from "../ai/config";
import { cloudinaryConfig } from "../video";
import { pushConfigured } from "../push";
import { webhookEnabled } from "./finance-bank";
import {
  ERROR_SOURCES,
  ERROR_SOURCE_LABEL,
  ERROR_STATUSES,
  JOB_KIND_LABEL,
  type AiProviderStateDto,
  type ChannelsDto,
  type EnvFlagDto,
  type ErrorCountsDto,
  type ErrorEventDto,
  type ErrorListDto,
  type ErrorSource,
  type ErrorStatus,
  type InfraDto,
  type JobCheckDto,
  type JobRunDto,
  type JobStepDto,
  type OpsIssue,
  type OpsLevel,
  type OpsSummaryDto,
  type OutboxStatDto,
  type SystemStatusDto,
  type WatchedJobKind,
} from "@/lib/types/system";

// =====================================================================
// Cài đặt → Hệ thống (CHỈ Admin — quyền system.monitor): tình trạng tác vụ nền (cron sáng/tối), nhịp tim sao lưu, nhật ký lỗi đã gộp,
// kênh gửi (thông báo đẩy, email, Zalo, ngân hàng, AI) và hạ tầng (phiên bản, vùng, phân vùng nhật ký kiểm toán, biến môi trường — CHỈ cờ có/không).
//   • Tóm tắt cho dải cảnh báo (summary): MỘT vòng CSDL dưới RLS của luuxa_app (job_runs / error_events có chính sách đọc cho system.monitor).
//   • Bản đầy đủ: kiểm quyền người gọi bằng luuxa_app TRƯỚC (kèm kiểm phiên đăng nhập), rồi mới đọc số liệu hệ thống bằng worker
//     (notification_outbox, push_subscriptions… không có chính sách cho luuxa_app).
// Ngưỡng quá hạn khớp /api/health?deep=1: cron 30 giờ (chỉ khi chạy trên Vercel), sao lưu CSDL 36 giờ, sao lưu tệp hằng tuần 8 ngày
// (sao lưu chỉ xét khi đã từng nhận nhịp tim, hoặc OPS_REQUIRE_BACKUP_HEARTBEAT=1).
// =====================================================================

export const SYSTEM_PERMISSION = "system.monitor";
export const CRON_STALE_HOURS = 30;
export const BACKUP_STALE_HOURS = 36;
export const STORAGE_BACKUP_STALE_HOURS = 8 * 24;
/** Lượt chạy chưa kết thúc sau chừng này phút ⇒ coi như bị dừng giữa chừng (hàm cron Vercel chỉ có 60 giây). */
export const RUN_HUNG_MINUTES = 10;
export const WATCHED_KINDS: WatchedJobKind[] = ["cron:morning", "cron:evening", "backup", "backup:storage"];

export const onVercel = () => !!process.env.VERCEL;
const backupRequired = () => process.env.OPS_REQUIRE_BACKUP_HEARTBEAT === "1";

const PERM_SQL = "SELECT app.has_permission('system.monitor') AS ok";

export async function assertSystemMonitor(tx: Tx): Promise<void> {
  const ok = (await tx.query<{ ok: boolean }>(PERM_SQL)).rows[0]?.ok;
  if (!ok) throw forbidden("Chỉ Admin được xem tình trạng hệ thống.");
}

const iso = (v: unknown): string | null => (v ? new Date(v as string | Date).toISOString() : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------
// Lượt chạy (job_runs)
// ---------------------------------------------------------------------
interface JobRunRow {
  id: string;
  kind: string;
  started_at: Date;
  finished_at: Date | null;
  ok: boolean | null;
  steps: unknown;
  summary: string | null;
  request_id: string | null;
}

/**
 * Lượt sao lưu do repo sao lưu báo về SAU khi chạy xong: nơi gửi không phải lúc nào cũng đo được thời gian, và các lượt cũ lưu `ms: 0`
 * thay cho "không biết" — với loại này 0 nghĩa là chưa đo (một bước sao lưu không thể mất 0 ms) ⇒ hiện "—" thay vì "0 ms".
 */
const isReportedRun = (kind: string) => kind === "backup" || kind === "backup:storage";

function normSteps(raw: unknown, zeroMeansUnknown = false): JobStepDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const ms = o.ms === null || o.ms === undefined ? NaN : Number(o.ms);
    return {
      name: String(o.name ?? "?").slice(0, 80),
      ok: o.ok !== false,
      ms: Number.isFinite(ms) && ms >= 0 && !(zeroMeansUnknown && ms === 0) ? Math.round(ms) : null,
      error: typeof o.error === "string" && o.error ? o.error.slice(0, 500) : null,
      info: Array.isArray(o.info) ? o.info.filter((x): x is string => typeof x === "string").slice(0, 30) : [],
    };
  });
}

export function toJobRun(r: JobRunRow, now = Date.now()): JobRunDto {
  const reported = isReportedRun(r.kind);
  const steps = normSteps(r.steps, reported);
  const started = new Date(r.started_at).getTime();
  const finished = r.finished_at ? new Date(r.finished_at).getTime() : null;
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: JOB_KIND_LABEL[r.kind] ?? r.kind,
    startedAt: new Date(started).toISOString(),
    finishedAt: finished === null ? null : new Date(finished).toISOString(),
    ok: r.ok,
    hung: finished === null && now - started > RUN_HUNG_MINUTES * 60_000,
    durationMs: finished === null || (reported && finished === started) ? null : Math.max(0, finished - started),
    stepCount: steps.length,
    failedSteps: steps.filter((s) => !s.ok).length,
    summary: r.summary,
    requestId: r.request_id,
    steps,
  };
}

function withoutSteps(r: JobRunDto): Omit<JobRunDto, "steps"> {
  const { steps, ...rest } = r;
  void steps;
  return rest;
}

/** Lượt gần nhất + lần đạt gần nhất của từng loại được theo dõi (chạy được cả dưới RLS luuxa_app lẫn worker). */
export const JOB_CHECKS_SQL = `
  SELECT k.kind AS watched, l.id, l.kind, l.started_at, l.finished_at, l.ok, l.steps, l.summary, l.request_id,
         (SELECT max(j.started_at) FROM job_runs j WHERE j.kind = k.kind AND j.ok IS TRUE) AS last_ok_at
    FROM unnest($1::text[]) AS k(kind)
    LEFT JOIN LATERAL (SELECT * FROM job_runs j WHERE j.kind = k.kind ORDER BY j.started_at DESC LIMIT 1) l ON true`;

export type JobCheckRow = Partial<JobRunRow> & { watched: string; last_ok_at: Date | null };

const STALE_LABEL = (h: number) => (h >= 48 ? `${Math.round(h / 24)} ngày` : `${h} giờ`);

/** Đánh giá tình trạng một loại tác vụ: đạt / lỗi / quá hạn / không kết thúc / chưa có. */
export function evalJob(kind: WatchedJobKind, row: JobCheckRow | undefined, now = Date.now()): JobCheckDto {
  const isCron = kind.startsWith("cron:");
  const staleHours = kind === "backup:storage" ? STORAGE_BACKUP_STALE_HOURS : isCron ? CRON_STALE_HOURS : BACKUP_STALE_HOURS;
  const last = row?.id ? withoutSteps(toJobRun(row as JobRunRow, now)) : null;
  const everSeen = !!last;
  const watched = isCron ? onVercel() : everSeen || backupRequired();
  const lastOkAt = iso(row?.last_ok_at);
  const ageHours = lastOkAt ? round1((now - Date.parse(lastOkAt)) / 3_600_000) : null;
  const stale = watched && (ageHours === null || ageHours > staleHours);

  let level: OpsLevel;
  let status: string;
  if (!last) {
    level = watched ? "error" : "unknown";
    status = isCron
      ? watched
        ? "Chưa có lượt chạy nào — kiểm tra Vercel → Cron Jobs và biến CRON_SECRET."
        : "Chưa chạy lần nào trên máy chủ này."
      : watched
        ? "Chưa nhận nhịp tim nào từ repo sao lưu."
        : "Chưa nhận nhịp tim — repo sao lưu chưa được nối với ứng dụng (OPS_HEARTBEAT_SECRET + APP_URL).";
  } else if (last.ok === false) {
    level = "error";
    status = isCron ? `Lượt gần nhất lỗi ${last.failedSteps || 1} bước.` : "Lần sao lưu gần nhất THẤT BẠI.";
  } else if (last.hung) {
    level = "error";
    status = "Lượt gần nhất không chạy xong (hàm có thể đã bị dừng vì quá thời gian).";
  } else if (stale) {
    level = "error";
    status = `Quá ${STALE_LABEL(staleHours)} chưa có lượt chạy đạt.`;
  } else if (last.ok === null) {
    level = "ok";
    status = "Đang chạy…";
  } else {
    level = "ok";
    status = isCron && !watched ? "Lượt gần nhất đạt (máy chủ này không chạy theo lịch Vercel Cron)." : "Hoạt động bình thường.";
  }
  return { kind, label: JOB_KIND_LABEL[kind] ?? kind, level, status, last, lastOkAt, ageHours, staleHours, watched, everSeen };
}

export function jobChecks(rows: JobCheckRow[], now = Date.now()): JobCheckDto[] {
  return WATCHED_KINDS.map((k) => evalJob(k, rows.find((r) => r.watched === k), now));
}

const ERROR_COUNTS_SQL = `
  SELECT count(*) FILTER (WHERE status = 'new')::int AS new, count(*) FILTER (WHERE status = 'ack')::int AS ack,
         count(*) FILTER (WHERE status = 'resolved')::int AS resolved, count(*)::int AS all,
         count(*) FILTER (WHERE status = 'new' AND last_seen > now() - interval '24 hours')::int AS new24h
    FROM error_events`;

function summarize(checks: JobCheckDto[], newErrors24h: number): OpsSummaryDto {
  const issues: OpsIssue[] = [];
  for (const c of checks) {
    if (c.level === "error") issues.push({ key: c.kind, level: "error", title: `${c.label}: ${c.status}` });
  }
  if (newErrors24h > 0) {
    issues.push({ key: "errors", level: "warn", title: `${newErrors24h} lỗi hệ thống mới trong 24 giờ qua chưa được xem.` });
  }
  const level = issues.some((i) => i.level === "error") ? "error" : issues.length ? "warn" : "ok";
  return { level, issues, newErrors24h, onVercel: onVercel(), generatedAt: new Date().toISOString() };
}

/** Bản tóm tắt nhẹ cho dải cảnh báo: MỘT vòng CSDL (luuxa_app, RLS). */
export async function getOpsSummary(tx: Tx): Promise<OpsSummaryDto> {
  const [perm, jobs, errs] = await batch(tx, [[PERM_SQL], [JOB_CHECKS_SQL, [WATCHED_KINDS]], [ERROR_COUNTS_SQL]]);
  if (!(perm.rows[0] as { ok: boolean }).ok) throw forbidden("Chỉ Admin được xem tình trạng hệ thống.");
  return summarize(jobChecks(jobs.rows as JobCheckRow[]), (errs.rows[0] as { new24h: number }).new24h);
}

// ---------------------------------------------------------------------
// Biến môi trường — CHỈ cờ có/không
// ---------------------------------------------------------------------
const has = (...keys: string[]) => keys.every((k) => !!process.env[k]?.trim());

export function envFlags(): EnvFlagDto[] {
  const ai = Object.values(providerConfigs())
    .filter((p) => !!p.apiKey)
    .map((p) => p.label);
  const supabase = (has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL")) && has("SUPABASE_SERVICE_ROLE_KEY");
  const video = process.env.VIDEO_PROVIDER?.trim();
  return [
    {
      key: "CRON_SECRET",
      label: "Khóa tác vụ hằng ngày (Vercel Cron)",
      set: has("CRON_SECRET"),
      required: true,
      hint: "Thiếu ⇒ /api/cron/daily từ chối mọi lượt: không có tin nhắc tự động, không dọn dẹp, không đo dung lượng.",
    },
    {
      key: "VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY",
      label: "Thông báo đẩy (Web Push)",
      set: pushConfigured(),
      required: true,
      hint: "Thiếu ⇒ không gửi được thông báo tới điện thoại/máy tính (vẫn có trong chuông thông báo của ứng dụng).",
    },
    {
      key: "RESEND_API_KEY + EMAIL_FROM",
      label: "Gửi email (Resend)",
      set: has("RESEND_API_KEY", "EMAIL_FROM"),
      required: false,
      hint: "Thiếu ⇒ ẩn “Quên mật khẩu”, email thông báo bị bỏ qua. Resend cần tên miền riêng (không nhận *.vercel.app).",
      note: process.env.EMAIL_DEV_LOG === "1" ? "EMAIL_DEV_LOG=1: email chỉ in ra nhật ký máy chủ." : null,
    },
    {
      key: "ZALO_BOT_TOKEN",
      label: "Bot Zalo (đăng tin nhóm của nhà)",
      set: has("ZALO_BOT_TOKEN"),
      required: false,
      hint: "Thiếu ⇒ không đăng được tin tự động / thủ công vào nhóm Zalo.",
    },
    {
      key: "BANK_WEBHOOK_SECRET",
      label: "Webhook ngân hàng (SePay / Casso)",
      set: webhookEnabled(),
      required: false,
      hint: "Thiếu (hoặc ngắn hơn 16 ký tự) ⇒ không nhận giao dịch chuyển khoản tự động.",
    },
    {
      key: "GROQ_API_KEY / GEMINI_API_KEY",
      label: "Trợ lý AI",
      set: ai.length > 0,
      required: false,
      hint: "Thiếu ⇒ các tính năng AI tự ẩn, mọi việc vẫn làm thủ công được.",
      note: ai.length ? `Có khóa: ${ai.join(", ")}` : null,
    },
    {
      key: "CLOUDINARY_CLOUD_NAME + API_KEY + API_SECRET",
      label: "Cloudinary (lưu & phát video)",
      set: !!cloudinaryConfig(),
      required: false,
      hint: "Thiếu ⇒ video lưu ở Supabase Storage (tối đa 50 MB/tệp ở gói miễn phí).",
      note: video ? `VIDEO_PROVIDER=${video.slice(0, 20)}` : null,
    },
    {
      key: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase Storage (ảnh, PDF)",
      set: supabase,
      required: true,
      hint: "Thiếu ⇒ tệp lưu trên ổ đĩa máy chủ — trên Vercel sẽ MẤT sau mỗi lần triển khai.",
      note: process.env.STORAGE_DRIVER === "local" ? "Đang ép dùng ổ đĩa local (STORAGE_DRIVER=local)." : null,
    },
    {
      key: "OPS_HEARTBEAT_SECRET",
      label: "Nhịp tim sao lưu",
      set: has("OPS_HEARTBEAT_SECRET"),
      required: true,
      hint: "Thiếu ⇒ repo sao lưu không báo kết quả về được; không phát hiện được sao lưu ngừng chạy.",
    },
    {
      key: "DB_SSL_CA",
      label: "Kiểm chứng chỉ TLS của CSDL",
      set: has("DB_SSL_CA"),
      required: false,
      hint: "Thiếu ⇒ kết nối CSDL vẫn mã hóa nhưng không kiểm chứng chỉ máy chủ (chống giả mạo).",
    },
    {
      key: "NEXT_PUBLIC_APP_URL",
      label: "Địa chỉ công khai của ứng dụng",
      set: has("NEXT_PUBLIC_APP_URL"),
      required: true,
      hint: "Dùng cho liên kết trong email, tin Zalo, lịch. Thiếu ⇒ suy từ tên miền của từng request.",
    },
  ];
}

// ---------------------------------------------------------------------
// Bản đầy đủ (Cài đặt → Hệ thống)
// ---------------------------------------------------------------------
const AI_LABEL: Record<string, string> = { groq: "Groq", gemini: "Gemini", cloudflare: "Cloudflare" };

const STATUS_SQL: [string, unknown[]?][] = [
  // 0. tác vụ được theo dõi
  [JOB_CHECKS_SQL, [WATCHED_KINDS]],
  // 1. lỗi theo trạng thái
  [ERROR_COUNTS_SQL],
  // 2. thiết bị nhận thông báo đẩy còn hiệu lực
  [
    `SELECT count(*)::int AS devices, count(DISTINCT user_id)::int AS users
       FROM push_subscriptions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
  ],
  // 3. hàng đợi gửi 7 ngày theo kênh × trạng thái
  [
    `SELECT channel::text AS channel, status::text AS status, count(*)::int AS n
       FROM notification_outbox WHERE created_at > now() - interval '7 days' GROUP BY 1, 2`,
  ],
  // 4. dòng chờ gửi đã quá hạn gửi > 15 phút (kẹt)
  [
    `SELECT channel::text AS channel, count(*)::int AS n, min(next_attempt_at) AS oldest
       FROM notification_outbox WHERE status IN ('queued', 'sending') AND next_attempt_at < now() - interval '15 minutes' GROUP BY 1`,
  ],
  // 5. Zalo 7 ngày
  [
    `SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'skipped')::int AS skipped
       FROM zalo_message_log WHERE sent_at > now() - interval '7 days'`,
  ],
  // 6. lần gửi Zalo lỗi gần nhất
  ["SELECT sent_at, error FROM zalo_message_log WHERE status = 'failed' ORDER BY sent_at DESC LIMIT 1"],
  // 7. cấu hình liên quan
  ["SELECT key, value FROM settings WHERE key IN ('integration.zalo.group_enabled', 'integration.zalo.group_chat_id', 'feature.ai.enabled')"],
  // 8. giao dịch ngân hàng
  [
    `SELECT count(*) FILTER (WHERE match_status = 'unmatched')::int AS unmatched,
            count(*) FILTER (WHERE match_status = 'unmatched' AND imported_at < now() - interval '7 days')::int AS stale,
            min(imported_at) FILTER (WHERE match_status = 'unmatched') AS oldest,
            max(imported_at) FILTER (WHERE source IN ('sepay', 'casso')) AS last_webhook
       FROM bank_statement_lines`,
  ],
  // 9. AI 7 ngày
  [
    `SELECT count(*)::int AS jobs, count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*) FILTER (WHERE status = 'blocked')::int AS blocked
       FROM ai_jobs WHERE created_at > now() - interval '7 days'`,
  ],
  // 10. lỗi AI gần nhất (chỉ thông điệp ngắn đã lưu — không có nội dung người dùng)
  ["SELECT error_message, COALESCE(finished_at, created_at) AS at FROM ai_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1"],
  // 11. ngân sách AI tháng này
  ["SELECT month::text AS month, limit_vnd, used_vnd, alert_threshold_pct, hard_stop FROM ai_budgets WHERE month = date_trunc('month', app.local_today())::date"],
  // 12. ngắt mạch nhà cung cấp AI (db/app/1043)
  ["SELECT provider, failures, open_until, last_error, last_failure_at FROM ai_provider_state"],
  // 13. hạ tầng: phân vùng audit + phiên bản PostgreSQL
  [
    `SELECT COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = 'audit_logs_default'), 0)::bigint AS default_rows,
            (SELECT max(c.relname::text) FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
              WHERE i.inhparent = 'public.audit_logs'::regclass AND c.relname ~ '^audit_logs_[0-9]{4}_[0-9]{2}$') AS latest,
            to_char(app.local_today(), 'YYYY_MM') AS cur,
            current_setting('server_version') AS pg`,
  ],
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getSystemStatus(ctx: Pick<Ctx, "db" | "dbAs">): Promise<SystemStatusDto> {
  // Kiểm quyền người gọi TRƯỚC (luuxa_app: kèm kiểm phiên đăng nhập còn hiệu lực) — chỉ sau đó mới đọc số liệu hệ thống bằng worker
  const t0 = performance.now();
  await ctx.db(assertSystemMonitor);
  const dbLatencyMs = Math.round(performance.now() - t0);
  const r = await ctx.dbAs("luuxa_worker", (tx) => batch(tx, STATUS_SQL));
  const now = Date.now();

  const checks = jobChecks(r[0].rows as JobCheckRow[], now);
  const errs = r[1].rows[0] as ErrorCountsDto & { new24h: number };
  const summary = summarize(checks, errs.new24h);

  // --- kênh gửi ---
  const outboxMap = new Map<string, OutboxStatDto>();
  for (const row of r[3].rows as { channel: string; status: string; n: number }[]) {
    const o = outboxMap.get(row.channel) ?? { channel: row.channel, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
    const k = row.status === "delivered" ? "sent" : row.status;
    if (k in o) (o as any)[k] += row.n;
    outboxMap.set(row.channel, o);
  }
  const settings = Object.fromEntries((r[7].rows as { key: string; value: unknown }[]).map((x) => [x.key, x.value]));
  const zaloRow = r[5].rows[0] as { sent: number; failed: number; skipped: number };
  const zaloFail = r[6].rows[0] as { sent_at: Date; error: string | null } | undefined;
  const bank = r[8].rows[0] as { unmatched: number; stale: number; oldest: Date | null; last_webhook: Date | null };
  const ai7 = r[9].rows[0] as { jobs: number; failed: number; blocked: number };
  const aiFail = r[10].rows[0] as { error_message: string | null; at: Date } | undefined;
  const budget = r[11].rows[0] as { month: string; limit_vnd: number; used_vnd: number; alert_threshold_pct: number; hard_stop: boolean } | undefined;
  const breakers = r[12].rows as { provider: string; failures: number; open_until: Date | null; last_error: string | null; last_failure_at: Date | null }[];
  const cfg = providerConfigs();
  const providers: AiProviderStateDto[] = (["groq", "cloudflare", "gemini"] as const).map((id) => {
    const b = breakers.find((x) => x.provider === id);
    // Cloudflare còn một trạng thái riêng: hết hạn mức tạo ảnh trong ngày (tạm dừng đến 00:00 UTC) — không phải lỗi hỏng hóc
    const q = id === "cloudflare" ? breakers.find((x) => x.provider === "cloudflare_image") : undefined;
    const quotaOpen = !!q?.open_until && new Date(q.open_until).getTime() > now;
    const until = b?.open_until && new Date(b.open_until).getTime() > now ? iso(b.open_until) : quotaOpen ? iso(q!.open_until) : null;
    return {
      provider: id,
      label: AI_LABEL[id] ?? id,
      configured: !!cfg[id]?.apiKey,
      failures: b?.failures ?? 0,
      pausedUntil: until,
      lastError: b?.last_error ?? (quotaOpen ? q!.last_error : null),
      lastFailureAt: iso(b?.last_failure_at ?? (quotaOpen ? q!.last_failure_at : null)),
    };
  });
  const zaloConfigured = has("ZALO_BOT_TOKEN") && settings["integration.zalo.group_enabled"] === true && typeof settings["integration.zalo.group_chat_id"] === "string" && !!String(settings["integration.zalo.group_chat_id"]).trim();
  const channels: ChannelsDto = {
    push: { configured: pushConfigured(), devices: (r[2].rows[0] as any).devices, users: (r[2].rows[0] as any).users },
    email: { configured: has("RESEND_API_KEY", "EMAIL_FROM") || process.env.EMAIL_DEV_LOG === "1" },
    outbox: [...outboxMap.values()].sort((a, b) => a.channel.localeCompare(b.channel)),
    stuck: (r[4].rows as { channel: string; n: number; oldest: Date }[]).map((x) => ({ channel: x.channel, count: x.n, oldestAt: iso(x.oldest)! })),
    zalo: {
      configured: zaloConfigured,
      sent7d: zaloRow.sent,
      failed7d: zaloRow.failed,
      skipped7d: zaloRow.skipped,
      lastFailedAt: iso(zaloFail?.sent_at),
      lastError: zaloFail?.error ? scrubMessage(zaloFail.error).slice(0, 200) : null,
    },
    bank: {
      configured: webhookEnabled(),
      unmatched: bank.unmatched,
      unmatchedOver7d: bank.stale,
      oldestUnmatchedAt: iso(bank.oldest),
      lastWebhookAt: iso(bank.last_webhook),
    },
    ai: {
      configured: providers.some((p) => p.configured),
      masterEnabled: settings["feature.ai.enabled"] === true,
      jobs7d: ai7.jobs,
      failed7d: ai7.failed,
      blocked7d: ai7.blocked,
      lastError: aiFail?.error_message ? aiFail.error_message.slice(0, 200) : null,
      lastFailedAt: iso(aiFail?.at),
      budget: budget
        ? { month: budget.month.slice(0, 7), limitVnd: Number(budget.limit_vnd), usedVnd: Number(budget.used_vnd), alertThresholdPct: budget.alert_threshold_pct, hardStop: budget.hard_stop }
        : null,
      providers,
    },
  };

  // --- hạ tầng ---
  const inf = r[13].rows[0] as { default_rows: number; latest: string | null; cur: string; pg: string };
  const latest = inf.latest ? inf.latest.replace(/^audit_logs_/, "").replace("_", "-") : null;
  const monthsAhead = latest
    ? (Number(latest.slice(0, 4)) - Number(inf.cur.slice(0, 4))) * 12 + (Number(latest.slice(5, 7)) - Number(inf.cur.slice(5, 7)))
    : null;
  const infra: InfraDto = {
    onVercel: onVercel(),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF?.slice(0, 60) ?? null,
    region: process.env.VERCEL_REGION?.slice(0, 30) ?? null,
    node: process.version,
    postgres: inf.pg?.split(" ")[0] ?? null,
    dbLatencyMs,
    audit: { defaultRows: Number(inf.default_rows) || 0, latestPartition: latest, monthsAhead },
    envFlags: envFlags(),
  };

  return { summary, notices: buildNotices(channels, infra), jobs: checks, errors: errs, channels, infra, generatedAt: new Date().toISOString() };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Cảnh báo phụ (vàng) chỉ hiện ở Cài đặt → Hệ thống — không đẩy lên dải cảnh báo chung. */
function buildNotices(ch: ChannelsDto, inf: InfraDto): OpsIssue[] {
  const out: OpsIssue[] = [];
  if (inf.audit.defaultRows > 0) {
    out.push({
      key: "audit-default",
      level: "warn",
      title: `Có ~${inf.audit.defaultRows.toLocaleString("vi-VN")} bản ghi nhật ký kiểm toán rơi vào phân vùng mặc định.`,
      detail: "Phân vùng tháng chưa được tạo kịp (bước dọn dẹp buổi tối). Kiểm tra tác vụ buổi tối và xem VAN_HANH.md.",
    });
  } else if (inf.audit.monthsAhead !== null && inf.audit.monthsAhead < 1) {
    out.push({ key: "audit-ahead", level: "warn", title: "Chưa có phân vùng nhật ký kiểm toán cho tháng sau.", detail: "Bước dọn dẹp buổi tối tự tạo trước 3 tháng — kiểm tra tác vụ buổi tối có chạy không." });
  }
  for (const s of ch.stuck) {
    if (s.channel === "web_push" && !ch.push.configured) continue; // chưa cấu hình VAPID: đã báo ở thẻ biến môi trường
    out.push({ key: `stuck-${s.channel}`, level: "warn", title: `${s.count} thông báo ${s.channel === "email" ? "email" : s.channel === "web_push" ? "đẩy" : s.channel} đang kẹt trong hàng đợi gửi.` });
  }
  if (ch.bank.unmatchedOver7d > 0) out.push({ key: "bank", level: "warn", title: `${ch.bank.unmatchedOver7d} giao dịch ngân hàng chưa khớp quá 7 ngày.`, detail: "Thủ quỹ xử lý ở Thu chi → Tổng quan → Giao dịch ngân hàng." });
  if (ch.zalo.failed7d > 0) out.push({ key: "zalo", level: "warn", title: `${ch.zalo.failed7d} tin Zalo gửi lỗi trong 7 ngày qua.`, detail: ch.zalo.lastError ?? undefined });
  for (const p of ch.ai.providers) {
    if (p.pausedUntil) out.push({ key: `ai-${p.provider}`, level: "warn", title: `${p.label} đang tạm dừng sau nhiều lỗi liên tiếp (tự thử lại lúc ${new Date(p.pausedUntil).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}).` });
  }
  const b = ch.ai.budget;
  if (b && b.limitVnd > 0 && b.usedVnd * 100 >= b.limitVnd * b.alertThresholdPct) {
    out.push({ key: "ai-budget", level: "warn", title: `Chi phí AI tháng này đã dùng ${Math.round((b.usedVnd / b.limitVnd) * 100)}% ngân sách.` });
  }
  if (inf.onVercel) {
    const missing = inf.envFlags.filter((f) => f.required && !f.set);
    if (missing.length) out.push({ key: "env", level: "warn", title: `Thiếu biến môi trường nên có: ${missing.map((f) => f.key).join(", ")}.` });
  }
  return out;
}

// ---------------------------------------------------------------------
// Lịch sử lượt chạy
// ---------------------------------------------------------------------
export const JobRunsQuery = z.object({
  kind: z.string().trim().max(40).regex(/^[a-z:.-]*$/, "Loại lượt chạy không hợp lệ.").optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function listJobRuns(tx: Tx, q: z.infer<typeof JobRunsQuery>): Promise<{ items: JobRunDto[] }> {
  const kind = q.kind || "all";
  const [perm, runs] = await batch(tx, [
    [PERM_SQL],
    [
      `SELECT id, kind, started_at, finished_at, ok, steps, summary, request_id FROM job_runs
        WHERE $1::text = 'all'
           OR ($1 = 'cron' AND kind IN ('cron:morning', 'cron:evening'))
           OR ($1 = 'manual' AND kind IN ('cron:manual', 'cron:storage'))
           OR ($1 = 'backup' AND kind LIKE 'backup%')
           OR kind = $1
        ORDER BY started_at DESC LIMIT $2`,
      [kind, q.limit ?? 30],
    ],
  ]);
  if (!(perm.rows[0] as { ok: boolean }).ok) throw forbidden("Chỉ Admin được xem lịch sử tác vụ nền.");
  const now = Date.now();
  return { items: (runs.rows as JobRunRow[]).map((r) => toJobRun(r, now)) };
}

// ---------------------------------------------------------------------
// Nhật ký lỗi
// ---------------------------------------------------------------------
export const ErrorsQuery = z.object({
  status: z.enum(["new", "ack", "resolved", "all"], { error: "Trạng thái lọc không hợp lệ." }).optional(),
  /** Rỗng = mọi nguồn */
  source: z
    .string()
    .trim()
    .max(20)
    .optional()
    .refine((v) => !v || (ERROR_SOURCES as readonly string[]).includes(v), "Nguồn lỗi không hợp lệ."),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

interface ErrorRow {
  id: string;
  source: ErrorSource;
  route: string | null;
  code: string | null;
  message: string;
  count: number;
  first_seen: Date;
  last_seen: Date;
  status: ErrorStatus;
  sample_request_id: string | null;
  notified_at: Date | null;
  resolved_at: Date | null;
  resolved_by_name: string | null;
  sample_user_name: string | null;
}

const ERROR_SELECT = `
  SELECT e.id, e.source, e.route, e.code, e.message, e.count, e.first_seen, e.last_seen, e.status, e.sample_request_id, e.notified_at, e.resolved_at,
         COALESCE(rm.display_name, rm.full_name, ru.email::text) AS resolved_by_name,
         COALESCE(sm.display_name, sm.full_name) AS sample_user_name
    FROM error_events e
    LEFT JOIN users ru ON ru.id = e.resolved_by
    LEFT JOIN members rm ON rm.user_id = e.resolved_by AND rm.deleted_at IS NULL
    LEFT JOIN members sm ON sm.user_id = e.sample_user_id AND sm.deleted_at IS NULL`;

function toErrorDto(r: ErrorRow): ErrorEventDto {
  return {
    id: r.id,
    source: r.source,
    route: r.route,
    code: r.code,
    message: r.message,
    count: r.count,
    firstSeen: iso(r.first_seen)!,
    lastSeen: iso(r.last_seen)!,
    status: r.status,
    sampleRequestId: r.sample_request_id,
    shortCode: r.sample_request_id ? r.sample_request_id.slice(0, 8) : null,
    sampleUser: r.sample_user_name,
    notifiedAt: iso(r.notified_at),
    resolvedAt: iso(r.resolved_at),
    resolvedBy: r.resolved_by_name,
  };
}

export async function listErrors(tx: Tx, q: z.infer<typeof ErrorsQuery>): Promise<ErrorListDto> {
  const limit = q.limit ?? 100;
  const params: unknown[] = [];
  const where: string[] = [];
  if (q.source) {
    params.push(q.source);
    where.push(`e.source = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, "\\$&")}%`);
    const p = `$${params.length}`;
    where.push(`(e.message ILIKE ${p} OR e.route ILIKE ${p} OR e.code ILIKE ${p} OR e.sample_request_id ILIKE ${p})`);
  }
  const base = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const status = q.status && q.status !== "all" ? q.status : null;
  const listParams = [...params];
  let listWhere = base;
  if (status) {
    listParams.push(status);
    listWhere = `${base ? `${base} AND` : "WHERE"} e.status = $${listParams.length}`;
  }
  listParams.push(limit + 1);
  const [perm, list, counts] = await batch(tx, [
    [PERM_SQL],
    [`${ERROR_SELECT} ${listWhere} ORDER BY e.last_seen DESC, e.id DESC LIMIT $${listParams.length}`, listParams],
    [
      `SELECT count(*) FILTER (WHERE e.status = 'new')::int AS new, count(*) FILTER (WHERE e.status = 'ack')::int AS ack,
              count(*) FILTER (WHERE e.status = 'resolved')::int AS resolved, count(*)::int AS all
         FROM error_events e ${base}`,
      params,
    ],
  ]);
  if (!(perm.rows[0] as { ok: boolean }).ok) throw forbidden("Chỉ Admin được xem nhật ký lỗi hệ thống.");
  const rows = list.rows as ErrorRow[];
  return { items: rows.slice(0, limit).map(toErrorDto), counts: counts.rows[0] as ErrorCountsDto, more: rows.length > limit };
}

export const ErrorStatusBody = z.object({ status: z.enum(ERROR_STATUSES) });
export const ErrorBulkBody = z.object({
  status: z.enum(ERROR_STATUSES),
  ids: z.array(z.string().uuid("Mã lỗi không hợp lệ.")).min(1, "Chưa chọn lỗi nào.").max(200, "Tối đa 200 lỗi một lần."),
});

/** Đổi trạng thái (Mới / Đã xem / Đã sửa) của một hoặc nhiều lỗi. Ghi dưới RLS luuxa_app (chính sách cập nhật cho system.monitor). */
export async function setErrorStatus(tx: Tx, ids: string[], status: ErrorStatus): Promise<ErrorEventDto[]> {
  await assertSystemMonitor(tx);
  const upd = await tx.query<{ id: string }>(
    `UPDATE error_events
        SET status = $2,
            resolved_at = CASE WHEN $2 = 'resolved' THEN now() END,
            resolved_by = CASE WHEN $2 = 'resolved' THEN app.current_user_id() END
      WHERE id = ANY($1::uuid[])
      RETURNING id`,
    [ids, status],
  );
  if (!upd.rowCount) throw notFound("Không tìm thấy lỗi này (có thể đã được dọn sau 90 ngày).");
  const rows = (await tx.query<ErrorRow>(`${ERROR_SELECT} WHERE e.id = ANY($1::uuid[]) ORDER BY e.last_seen DESC`, [upd.rows.map((x) => x.id)])).rows;
  return rows.map(toErrorDto);
}

// ---------------------------------------------------------------------
// Nhịp tim sao lưu (repo sao lưu gọi về sau mỗi lần chạy)
// ---------------------------------------------------------------------
export const HeartbeatBody = z.object({
  kind: z.enum(["backup", "backup:storage"], { error: "kind phải là backup hoặc backup:storage." }),
  ok: z.boolean({ error: "Thiếu ok (true/false)." }),
  summary: z.string().max(500, "summary tối đa 500 ký tự.").optional(),
  /** Tổng thời gian cả lượt chạy (ms) nếu đo được — thiếu thì lịch sử hiện "—" (không bịa 0). */
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  steps: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        ok: z.boolean(),
        ms: z.number().int().min(0).max(86_400_000).optional(),
        error: z.string().max(500).optional(),
      }),
    )
    .max(20, "Tối đa 20 bước.")
    .optional(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatBody>;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** "unset" = chưa đặt OPS_HEARTBEAT_SECRET (⇒ 404), "bad" = sai/thiếu khóa (⇒ 401), "ok". So sánh hằng thời gian trên băm SHA-256. */
export function checkHeartbeatAuth(authorization: string | null): "unset" | "bad" | "ok" {
  const secret = process.env.OPS_HEARTBEAT_SECRET?.trim() ?? "";
  if (!secret) return "unset";
  const given = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim() ?? "";
  if (!given) return "bad";
  return timingSafeEqual(sha(given), sha(secret)) ? "ok" : "bad";
}

/**
 * Nhịp tim đến từ repo sao lưu (đã xác thực bằng khóa) nên không che số như nhật ký lỗi (tên tệp có ngày giờ, dung lượng…) — chỉ che chuỗi kết
 * nối, khóa/mật khẩu, email phòng khi lỡ in ra. Giữ xuống dòng.
 */
const scrubSecrets = (s: string) =>
  s
    .replace(/postgres(ql)?:\/\/[^\s"')]+/gi, "postgresql://***")
    .replace(/(bearer|apikey|token|secret|password|passphrase|key)([=: ]+)[^\s"',)]+/gi, "$1$2***")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/[^\S\n]+/g, " ")
    .trim();
const scrubLines = (s: string, max: number) =>
  s
    .split(/\r?\n/)
    .map(scrubSecrets)
    .filter(Boolean)
    .join("\n")
    .slice(0, max);

export async function recordHeartbeat(ctx: Pick<Ctx, "dbAs" | "requestId">, b: HeartbeatInput): Promise<{ id: string }> {
  // Bước không kèm thời gian thì KHÔNG ghi ms (trước đây ghi 0 ⇒ lịch sử hiện "0 ms" như thể bước chạy tức thì)
  const steps = (b.steps ?? []).map((s) => ({
    name: s.name,
    ok: s.ok,
    ...(s.ms !== undefined ? { ms: s.ms } : {}),
    ...(s.error ? { error: scrubSecrets(s.error).slice(0, 300) } : {}),
  }));
  const summary = b.summary?.trim() ? scrubLines(b.summary, 500) : null;
  // Nhịp tim đến SAU khi lượt sao lưu chạy xong: có durationMs thì lùi giờ bắt đầu lại đúng bằng đó; không có thì started_at = finished_at (= "chưa đo")
  const id = await ctx.dbAs("luuxa_worker", async (tx) =>
    (
      await tx.query<{ id: string }>(
        "INSERT INTO job_runs (kind, started_at, finished_at, ok, steps, summary, request_id) VALUES ($1, now() - make_interval(secs => $6::double precision / 1000.0), now(), $2, $3::jsonb, $4, $5) RETURNING id",
        [b.kind, b.ok, JSON.stringify(steps), summary, ctx.requestId, b.durationMs ?? 0],
      )
    ).rows[0].id,
  );
  if (!b.ok) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const failed = steps.filter((s) => !s.ok).map((s) => `• ${s.name}${s.error ? `: ${s.error}` : ""}`);
    await notifyAdminsOnce(
      `ops-alert:${b.kind}:failed:${today}`,
      b.kind === "backup" ? "Sao lưu CSDL hằng ngày THẤT BẠI" : "Sao lưu tệp (Storage) hằng tuần THẤT BẠI",
      [summary, ...failed, "Xem chi tiết ở tab Actions của repo sao lưu; lịch sử ở Cài đặt → Hệ thống."].filter(Boolean).join("\n").slice(0, 900),
      { link: "/cai-dat?tab=system" },
    );
  }
  return { id };
}

/** Nhãn nguồn lỗi (dùng trong tin tóm tắt). */
export const errorSourceLabel = (s: string) => ERROR_SOURCE_LABEL[s as ErrorSource] ?? s;

/** Lỗi API chuẩn cho nhịp tim — tách riêng để route gọn. */
export const heartbeatErrors = {
  unset: () => new ApiError(404, "NOT_FOUND", "Chưa bật nhịp tim sao lưu trên máy chủ này."),
  bad: () => new ApiError(401, "UNAUTHORIZED", "Sai khóa nhịp tim."),
  limited: () => new ApiError(429, "RATE_LIMITED", "Gửi nhịp tim quá nhiều lần trong một giờ."),
};
