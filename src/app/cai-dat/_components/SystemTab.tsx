"use client";

// Tab "Hệ thống" — CHỈ Admin (quyền system.monitor): tình trạng tác vụ nền (cron sáng/tối), sao lưu (nhịp tim từ repo sao lưu), lịch sử
// lượt chạy (bấm xem từng bước), nhật ký lỗi đã gộp (Mới / Đã xem / Đã sửa), kênh gửi (thông báo đẩy, email, Zalo, ngân hàng, AI) và hạ tầng
// (phiên bản, vùng, phân vùng nhật ký kiểm toán, biến môi trường — CHỈ cờ có/không). Dữ liệu: /api/v1/system/* (src/server/modules/system-status.ts).
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Archive,
  BellRing,
  Bug,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  Copy,
  DatabaseBackup,
  ExternalLink,
  HardDrive,
  HeartPulse,
  History,
  Info,
  KeyRound,
  Landmark,
  Loader2,
  Mail,
  MessageCircle,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ServerCog,
  Sparkles,
  Sun,
  XCircle,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { openSettingsTab, refreshSystem, systemApi, useErrorEvents, useJobRuns, useSystemStatus, type ErrorFilter } from "@/lib/data/system";
import {
  ERROR_SOURCES,
  ERROR_SOURCE_LABEL,
  ERROR_STATUS_LABEL,
  type ChannelsDto,
  type ErrorEventDto,
  type ErrorListDto,
  type ErrorStatus,
  type InfraDto,
  type JobCheckDto,
  type JobRunDto,
  type OpsIssue,
  type OpsLevel,
  type OutboxStatDto,
} from "@/lib/types/system";
import { cn } from "@/lib/utils";
import { FormCardsSkeleton } from "./TabSkeletons";
import { Card } from "./StorageStats";

// ---------------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const nf = (n: number) => n.toLocaleString("vi-VN");

function dayDiff(d: Date): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "07:03 hôm nay" / "19:01 hôm qua" / "07:00 12/10" */
function whenLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dd = dayDiff(d);
  if (dd === 0) return `${hm} hôm nay`;
  if (dd === 1) return `${hm} hôm qua`;
  return `${hm} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : ""}`;
}

function agoLabel(iso: string | null): string {
  if (!iso) return "chưa có";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86_400)} ngày trước`;
}

function msLabel(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m} phút${s ? ` ${s} giây` : ""}`;
}

const vnd = (n: number) => `${nf(n)}đ`;

// ---------------------------------------------------------------------
// Màu theo mức
// ---------------------------------------------------------------------
const LV: Record<OpsLevel, { chip: string; ring: string; dot: string; label: string }> = {
  ok: { chip: "bg-emerald-100 text-emerald-700", ring: "border-emerald-100", dot: "bg-emerald-500", label: "Ổn" },
  warn: { chip: "bg-amber-100 text-amber-700", ring: "border-amber-200", dot: "bg-amber-500", label: "Cần xem" },
  error: { chip: "bg-rose-100 text-rose-700", ring: "border-rose-200", dot: "bg-rose-500", label: "Có sự cố" },
  unknown: { chip: "bg-gray-100 text-gray-500", ring: "border-purple-100", dot: "bg-gray-300", label: "Chưa có" },
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap", className)}>{children}</span>;
}

function runChip(r: Pick<JobRunDto, "ok" | "hung" | "failedSteps" | "kind">): { text: string; cls: string } {
  const backup = r.kind.startsWith("backup");
  if (r.ok === true) return { text: "Đạt", cls: "bg-emerald-100 text-emerald-700" };
  if (r.ok === false) return { text: backup ? "Thất bại" : r.failedSteps ? `Lỗi ${r.failedSteps} bước` : "Lỗi", cls: "bg-rose-100 text-rose-700" };
  if (r.hung) return { text: "Không kết thúc", cls: "bg-rose-100 text-rose-700" };
  return { text: "Đang chạy", cls: "bg-sky-100 text-sky-700" };
}

const linkBtn =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-100 bg-white text-[11px] font-bold text-gray-700 hover:text-primary hover:border-primary/40 transition";

// ---------------------------------------------------------------------
// Tổng quan
// ---------------------------------------------------------------------
function OverallBanner({ level, issues, notices }: { level: OpsLevel; issues: OpsIssue[]; notices: OpsIssue[] }) {
  const all = [...issues, ...notices];
  const tone =
    level === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : level === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-100 bg-emerald-50 text-emerald-900";
  return (
    <div className={cn("rounded-2xl border p-3.5 sm:p-4 flex items-start gap-3 text-xs", tone)} role={level === "error" ? "alert" : undefined}>
      {level === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
      <div className="min-w-0 space-y-1.5">
        <p className="font-bold">
          {level === "ok" ? "Mọi thứ đang hoạt động bình thường." : level === "error" ? "Có sự cố cần xử lý" : "Có mục cần xem"}
        </p>
        {all.length > 0 && (
          <ul className="space-y-1">
            {all.map((i) => (
              <li key={i.key} className="flex gap-2 leading-relaxed">
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1.5", i.level === "error" ? "bg-rose-500" : "bg-amber-500")} />
                <span className="min-w-0 break-words">
                  {i.title}
                  {i.detail ? <span className="opacity-80"> {i.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const JOB_META: Record<string, { icon: React.ComponentType<{ className?: string }>; schedule: string }> = {
  "cron:morning": { icon: Sun, schedule: "07:00 hằng ngày · Vercel Cron" },
  "cron:evening": { icon: Moon, schedule: "19:00 hằng ngày · Vercel Cron" },
  backup: { icon: DatabaseBackup, schedule: "02:17 hằng ngày · repo sao lưu (GitHub Actions)" },
  "backup:storage": { icon: Archive, schedule: "Chủ nhật hằng tuần · repo sao lưu" },
};

const staleText = (h: number) => (h >= 48 ? `${Math.round(h / 24)} ngày` : `${h} giờ`);

function JobTile({ c }: { c: JobCheckDto }) {
  const M = JOB_META[c.kind] ?? { icon: Activity, schedule: "" };
  const st = LV[c.level];
  const chip = c.last ? runChip(c.last) : null;
  const isCron = c.kind.startsWith("cron:");
  return (
    <div className={cn("bg-white rounded-2xl border p-4 space-y-3 min-w-0", st.ring)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
            <M.icon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-gray-900 leading-tight">{c.label}</p>
            <p className="text-[10.5px] text-gray-400 leading-snug">{M.schedule}</p>
          </div>
        </div>
        <Chip className={st.chip}>
          <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
          {c.level === "unknown" ? "Chưa có" : c.level === "ok" ? "Ổn" : "Sự cố"}
        </Chip>
      </div>
      <p className={cn("text-xs leading-relaxed", c.level === "error" ? "text-rose-700 font-semibold" : "text-gray-600")}>{c.status}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-gray-400">Lượt gần nhất</dt>
        <dd className="text-right font-semibold text-gray-700 truncate">
          {c.last ? (
            <span className="inline-flex items-center gap-1.5 justify-end flex-wrap">
              {whenLabel(c.last.startedAt)}
              {chip && <Chip className={chip.cls}>{chip.text}</Chip>}
            </span>
          ) : (
            "—"
          )}
        </dd>
        {isCron && c.last && (
          <>
            <dt className="text-gray-400">Thời gian chạy</dt>
            <dd className="text-right font-semibold text-gray-700">
              {msLabel(c.last.durationMs)} · {c.last.stepCount} bước
            </dd>
          </>
        )}
        <dt className="text-gray-400">Lần đạt gần nhất</dt>
        <dd className="text-right font-semibold text-gray-700">{c.lastOkAt ? agoLabel(c.lastOkAt) : "chưa có"}</dd>
        <dt className="text-gray-400">Cảnh báo khi</dt>
        <dd className="text-right font-semibold text-gray-700">{c.watched ? `quá ${staleText(c.staleHours)}` : isCron ? "không xét (không phải Vercel)" : "chưa nối"}</dd>
      </dl>
      {!isCron && c.last?.summary && <p className="text-[11px] text-gray-500 rounded-xl bg-surface/60 px-3 py-2 whitespace-pre-line break-words line-clamp-4">{c.last.summary}</p>}
    </div>
  );
}

function JobsCard({ jobs, onVercel }: { jobs: JobCheckDto[]; onVercel: boolean }) {
  return (
    <Card
      title="Tác vụ nền & sao lưu"
      icon={<HeartPulse className="w-4 h-4 text-primary" />}
      right={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={linkBtn} onClick={() => openSettingsTab("zalo")}>
            <ExternalLink className="w-3.5 h-3.5" /> Chạy thử tác vụ hằng ngày
          </button>
          <button type="button" className={linkBtn} onClick={() => openSettingsTab("storage")}>
            <HardDrive className="w-3.5 h-3.5" /> Dung lượng
          </button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {jobs.map((c) => (
          <JobTile key={c.kind} c={c} />
        ))}
      </div>
      <div className="rounded-2xl border border-purple-100 bg-surface/40 p-3.5 flex gap-2.5 text-[11px] text-gray-500 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          {onVercel
            ? "Cron do Vercel gọi mỗi ngày (có thể lệch tới 1 giờ); quá 30 giờ không có lượt chạy đạt là cron đã ngừng. "
            : "Máy chủ này không chạy trên Vercel nên không xét quá hạn của cron (tác vụ chạy bằng bộ hẹn giờ trong tiến trình hoặc chạy tay). "}
          Sao lưu báo về bằng nhịp tim từ repo sao lưu riêng (secret <b>OPS_HEARTBEAT_SECRET</b> + biến <b>APP_URL</b>, xem <span className="font-mono">ops/backup-repo/README.md</span>) — chỉ cảnh báo khi đã từng nhận nhịp tim.
          Theo dõi từ bên ngoài: đặt thêm một monitor (UptimeRobot, Better Stack…) trỏ vào <span className="font-mono">/api/health?deep=1</span> — trả 503 khi cron hoặc sao lưu quá hạn.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Lịch sử lượt chạy
// ---------------------------------------------------------------------
const RUN_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "cron", label: "Cron tự động" },
  { value: "manual", label: "Chạy tay" },
  { value: "backup", label: "Sao lưu" },
] as const;

function RunRow({ r }: { r: JobRunDto }) {
  const [open, setOpen] = useState(false);
  const chip = runChip(r);
  return (
    <li className="py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left px-2.5 sm:px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-gray-50/80 transition"
      >
        <span className={cn("w-2 h-2 rounded-full shrink-0", r.ok === true ? "bg-emerald-500" : r.ok === false || r.hung ? "bg-rose-500" : "bg-sky-500")} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-900 truncate">{r.kindLabel}</p>
          <p className="text-[11px] text-gray-400 truncate">
            {whenLabel(r.startedAt)} · {msLabel(r.durationMs)} · {r.stepCount} bước
          </p>
        </div>
        <Chip className={chip.cls}>{chip.text}</Chip>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mx-2.5 sm:mx-3 mb-2 mt-1 rounded-xl border border-gray-100 bg-gray-50/60 divide-y divide-gray-100 text-[11px]">
          {r.steps.length === 0 && <p className="p-3 text-gray-400">Lượt này không ghi danh sách bước.</p>}
          {r.steps.map((s, i) => (
            <div key={`${s.name}-${i}`} className="p-2.5 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                {s.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                <span className="font-mono font-bold text-gray-800 truncate">{s.name}</span>
                <span className="ml-auto text-gray-400 tabular-nums shrink-0">{msLabel(s.ms)}</span>
              </div>
              {s.error && <p className="text-rose-700 break-words pl-5">{s.error}</p>}
              {s.info.length > 0 && (
                <ul className="pl-5 space-y-0.5 text-gray-500">
                  {s.info.map((t, k) => (
                    <li key={k} className="break-words">
                      • {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {r.summary && <p className="p-2.5 text-gray-600 whitespace-pre-line break-words">{r.summary}</p>}
          <p className="p-2.5 text-gray-400 font-mono break-all">
            {new Date(r.startedAt).toLocaleString("vi-VN")}
            {r.requestId ? ` · request ${r.requestId.slice(0, 8)}` : ""}
          </p>
        </div>
      )}
    </li>
  );
}

function RunsCard() {
  const [kind, setKind] = useState<string>("all");
  const { runs, error, isLoading } = useJobRuns(kind, 30);
  return (
    <Card
      title="Lịch sử chạy (30 lượt gần nhất)"
      icon={<History className="w-4 h-4 text-primary" />}
      right={
        <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-xl overflow-x-auto max-w-full">
          {RUN_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKind(f.value)}
              className={cn("px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition", kind === f.value ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900")}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <p className="text-xs text-rose-700">{errorMessage(error)}</p>
      ) : isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Chưa có lượt chạy nào.</p>
      ) : (
        <ul className="-mx-2.5 sm:-mx-3 divide-y divide-gray-50">
          {runs.map((r) => (
            <RunRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Nhật ký lỗi
// ---------------------------------------------------------------------
const STATUS_TABS: { value: ErrorStatus | "all"; label: string }[] = [
  { value: "new", label: "Mới" },
  { value: "ack", label: "Đã xem" },
  { value: "resolved", label: "Đã sửa" },
  { value: "all", label: "Tất cả" },
];

const SOURCE_CHIP: Record<string, string> = {
  server: "bg-rose-50 text-rose-700",
  client: "bg-sky-50 text-sky-700",
  cron: "bg-amber-50 text-amber-800",
  csp: "bg-gray-100 text-gray-600",
  auth: "bg-indigo-50 text-indigo-700",
};
const STATUS_CHIP: Record<ErrorStatus, string> = {
  new: "bg-rose-100 text-rose-700",
  ack: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

function ErrorRow({ e, busy, onStatus, onCopy }: { e: ErrorEventDto; busy: boolean; onStatus: (s: ErrorStatus) => void; onCopy: (code: string) => void }) {
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition disabled:opacity-50";
  return (
    <li className="p-3.5 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className={SOURCE_CHIP[e.source] ?? "bg-gray-100 text-gray-600"}>{ERROR_SOURCE_LABEL[e.source] ?? e.source}</Chip>
        {e.code && <Chip className="bg-gray-100 text-gray-700 font-mono">{e.code}</Chip>}
        <Chip className={STATUS_CHIP[e.status]}>{ERROR_STATUS_LABEL[e.status]}</Chip>
        <span className="ml-auto text-xs font-extrabold text-gray-900 tabular-nums" title="Số lần đã xảy ra">
          ×{nf(e.count)}
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-900 break-words leading-relaxed">{e.message}</p>
      {e.route && <p className="text-[11px] font-mono text-gray-500 break-all">{e.route}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>Lần đầu {whenLabel(e.firstSeen)}</span>
        <span>Lần cuối {whenLabel(e.lastSeen)}</span>
        {e.shortCode && (
          <button type="button" onClick={() => onCopy(e.shortCode!)} className="inline-flex items-center gap-1 hover:text-primary" title="Chép mã lỗi">
            Mã lỗi <b className="font-mono text-gray-600">{e.shortCode}</b>
            <Copy className="w-3 h-3" />
          </button>
        )}
        {e.sampleUser && <span>Gặp gần nhất: {e.sampleUser}</span>}
        {e.status === "resolved" && e.resolvedAt && (
          <span>
            Đã sửa {whenLabel(e.resolvedAt)}
            {e.resolvedBy ? ` · ${e.resolvedBy}` : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {e.status === "new" && (
          <button type="button" disabled={busy} onClick={() => onStatus("ack")} className={cn(btn, "bg-amber-50 text-amber-800 hover:bg-amber-100")}>
            <CheckCheck className="w-3.5 h-3.5" /> Đã xem
          </button>
        )}
        {e.status !== "resolved" && (
          <button type="button" disabled={busy} onClick={() => onStatus("resolved")} className={cn(btn, "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Đã sửa
          </button>
        )}
        {e.status !== "new" && (
          <button type="button" disabled={busy} onClick={() => onStatus("new")} className={cn(btn, "bg-gray-50 text-gray-600 hover:bg-gray-100")}>
            <RotateCcw className="w-3.5 h-3.5" /> Mở lại
          </button>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-300 self-center" />}
      </div>
    </li>
  );
}

function ErrorsCard() {
  const { showToast } = useApp();
  const [status, setStatus] = useState<ErrorStatus | "all">("new");
  const [source, setSource] = useState<ErrorFilter["source"]>("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { list, error, isLoading, isValidating, mutate } = useErrorEvents({ status, source, q: qd });
  const counts = list?.counts;
  const items = list?.items ?? [];
  const newIds = items.filter((i) => i.status === "new").map((i) => i.id);

  /** Áp trạng thái mới lên danh sách đang xem: chuyển đếm, bỏ dòng không còn khớp bộ lọc (hoặc thay bằng bản máy chủ trả về). */
  const applyLocal = (cur: ErrorListDto | undefined, changed: Map<string, ErrorEventDto>): ErrorListDto | undefined => {
    if (!cur) return cur;
    const next: ErrorListDto = { ...cur, counts: { ...cur.counts }, items: [] };
    for (const it of cur.items) {
      const u = changed.get(it.id);
      if (!u) next.items.push(it);
      else {
        if (u.status !== it.status) {
          next.counts[it.status] = Math.max(0, next.counts[it.status] - 1);
          next.counts[u.status] += 1;
        }
        if (status === "all" || u.status === status) next.items.push(u);
      }
    }
    return next;
  };

  const change = async (ids: string[], s: ErrorStatus, key: string) => {
    setBusy(key);
    const before = list ?? undefined;
    // Lạc quan: đổi NGAY trên màn hình (máy chủ chậm vẫn thấy kết quả tức thì); lỗi thì trả lại như cũ
    const guess = new Map(items.filter((i) => ids.includes(i.id)).map((i) => [i.id, { ...i, status: s, resolvedAt: s === "resolved" ? new Date().toISOString() : null }]));
    await mutate((cur) => applyLocal(cur, guess), { revalidate: false });
    try {
      const updated = ids.length === 1 ? [await systemApi.setErrorStatus(ids[0], s)] : (await systemApi.setErrorsStatus(ids, s)).items;
      if (status === "all") await mutate((cur) => applyLocal(cur, new Map(updated.map((u) => [u.id, u]))), { revalidate: false });
      void refreshSystem();
      showToast("success", ids.length > 1 ? `Đã đánh dấu ${ids.length} lỗi là “${ERROR_STATUS_LABEL[s]}”.` : `Đã chuyển sang “${ERROR_STATUS_LABEL[s]}”.`);
    } catch (e) {
      await mutate(before, { revalidate: true });
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("success", `Đã chép mã lỗi ${code}.`);
    } catch {
      showToast("info", `Mã lỗi: ${code}`);
    }
  };

  const sourceOptions = [{ value: "", label: "Mọi nguồn" }, ...ERROR_SOURCES.map((s) => ({ value: s, label: ERROR_SOURCE_LABEL[s] }))];

  return (
    <Card
      title="Nhật ký lỗi"
      icon={<Bug className="w-4 h-4 text-primary" />}
      right={
        status === "new" && newIds.length > 0 ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => change(newIds, "ack", "all")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 text-[11px] font-bold transition disabled:opacity-50"
          >
            {busy === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            Đã xem tất cả ({newIds.length})
          </button>
        ) : null
      }
    >
      <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-xl overflow-x-auto w-full sm:w-fit" role="tablist" aria-label="Lọc theo trạng thái">
        {STATUS_TABS.map((t) => {
          const n = counts ? counts[t.value] : null;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition",
                status === t.value ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900",
              )}
            >
              {t.label}
              {n !== null && (
                <span className={cn("px-1.5 rounded-full text-[10px]", t.value === "new" && n > 0 ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500")}>{nf(n)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <CustomSelect<string> value={source} onChange={(v) => setSource(v as ErrorFilter["source"])} options={sourceOptions} aria-label="Lọc theo nguồn lỗi" />
        <CustomInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm thông điệp, đường dẫn hoặc mã lỗi 8 ký tự…"
          leftIcon={<Search className="w-4 h-4" />}
          aria-label="Tìm lỗi"
          data-no-dirty
        />
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        <b className="text-gray-500">Mã lỗi</b> người dùng thấy trong thông báo lỗi (vd. “mã lỗi: 1a2b3c4d”) là 8 ký tự đầu của mã request — gõ vào ô tìm để tra. Mỗi lỗi chỉ giữ mã của lần gặp
        gần nhất; lỗi giống nhau được gộp một dòng và đếm số lần. Lỗi đã “Đã sửa” mà xảy ra lại sẽ tự mở lại. Mỗi sáng Admin nhận một bản tóm tắt lỗi mới.
      </p>

      {error ? (
        <p className="text-xs text-rose-700">{errorMessage(error)}</p>
      ) : isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center space-y-1.5">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
          <p className="text-xs text-gray-500">{status === "new" ? "Không có lỗi mới nào cần xem." : "Không có lỗi nào khớp bộ lọc."}</p>
        </div>
      ) : (
        <ul className={cn("rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden", isValidating && "opacity-70")}>
          {items.map((e) => (
            <ErrorRow key={e.id} e={e} busy={busy === e.id} onStatus={(s) => change([e.id], s, e.id)} onCopy={copy} />
          ))}
        </ul>
      )}
      {list?.more && <p className="text-[11px] text-gray-400">Chỉ hiện 100 lỗi gần nhất — dùng bộ lọc để thu hẹp.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Kênh gửi
// ---------------------------------------------------------------------
function Tile({
  icon,
  title,
  ok,
  okText,
  badText,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  ok: boolean | null;
  okText?: string;
  badText?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-4 space-y-2.5 min-w-0 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">{icon}</span>
          <p className="text-sm font-extrabold text-gray-900 leading-tight">{title}</p>
        </div>
        {ok !== null && (
          <Chip className={ok ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}>{ok ? (okText ?? "Đã cấu hình") : (badText ?? "Chưa cấu hình")}</Chip>
        )}
      </div>
      <div className="space-y-1.5 text-[11px] text-gray-600 flex-1">{children}</div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" | "warn" | "good" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className={cn("font-semibold tabular-nums text-right", tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-gray-800")}>
        {value}
      </span>
    </div>
  );
}

function OutboxLine({ o }: { o: OutboxStatDto | undefined }) {
  if (!o) return <Stat label="7 ngày qua" value="chưa có thông báo" />;
  return (
    <>
      <Stat label="Đã gửi (7 ngày)" value={nf(o.sent)} tone={o.sent ? "good" : undefined} />
      <Stat label="Lỗi" value={nf(o.failed)} tone={o.failed ? "bad" : undefined} />
      <Stat label="Bỏ qua" value={nf(o.skipped)} />
      <Stat label="Đang chờ" value={nf(o.queued + o.sending)} tone={o.queued + o.sending > 0 ? "warn" : undefined} />
    </>
  );
}

function ChannelsCard({ ch }: { ch: ChannelsDto }) {
  const push = ch.outbox.find((o) => o.channel === "web_push");
  const email = ch.outbox.find((o) => o.channel === "email");
  const stuck = (c: string) => ch.stuck.find((s) => s.channel === c);
  const b = ch.ai.budget;
  const pct = b && b.limitVnd > 0 ? Math.min(100, (b.usedVnd / b.limitVnd) * 100) : 0;
  return (
    <Card title="Kênh gửi & tích hợp" icon={<BellRing className="w-4 h-4 text-primary" />}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile icon={<BellRing className="w-4 h-4" />} title="Thông báo đẩy" ok={ch.push.configured}>
          <Stat label="Thiết bị đang nhận" value={`${nf(ch.push.devices)} thiết bị · ${nf(ch.push.users)} người`} />
          <OutboxLine o={push} />
          {stuck("web_push") && (
            <p className={cn("rounded-lg px-2 py-1.5", ch.push.configured ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-500")}>
              {nf(stuck("web_push")!.count)} thông báo nằm chờ từ {whenLabel(stuck("web_push")!.oldestAt)}
              {ch.push.configured ? " — hàng đợi có thể đang kẹt." : " vì chưa cấu hình VAPID."}
            </p>
          )}
        </Tile>

        <Tile icon={<Mail className="w-4 h-4" />} title="Email" ok={ch.email.configured}>
          <OutboxLine o={email} />
          {stuck("email") && (
            <p className="rounded-lg px-2 py-1.5 bg-amber-50 text-amber-800">
              {nf(stuck("email")!.count)} email nằm chờ từ {whenLabel(stuck("email")!.oldestAt)}.
            </p>
          )}
          {!ch.email.configured && <p className="text-gray-400">Chưa có RESEND_API_KEY + EMAIL_FROM: email bị bỏ qua, “Quên mật khẩu” bị ẩn.</p>}
        </Tile>

        <Tile
          icon={<MessageCircle className="w-4 h-4" />}
          title="Nhóm Zalo"
          ok={ch.zalo.configured}
          okText="Đang bật"
          badText="Chưa bật"
          action={
            <button type="button" className={linkBtn} onClick={() => openSettingsTab("zalo")}>
              <ExternalLink className="w-3.5 h-3.5" /> Tích hợp Zalo
            </button>
          }
        >
          <Stat label="Đã gửi (7 ngày)" value={nf(ch.zalo.sent7d)} tone={ch.zalo.sent7d ? "good" : undefined} />
          <Stat label="Gửi lỗi" value={nf(ch.zalo.failed7d)} tone={ch.zalo.failed7d ? "bad" : undefined} />
          <Stat label="Bỏ qua (tắt / thiếu cấu hình)" value={nf(ch.zalo.skipped7d)} />
          {ch.zalo.lastError && (
            <p className="rounded-lg px-2 py-1.5 bg-rose-50 text-rose-700 break-words">
              Lỗi gần nhất ({whenLabel(ch.zalo.lastFailedAt)}): {ch.zalo.lastError}
            </p>
          )}
        </Tile>

        <Tile
          icon={<Landmark className="w-4 h-4" />}
          title="Giao dịch ngân hàng"
          ok={ch.bank.configured}
          okText="Webhook đã bật"
          badText="Chưa bật webhook"
          action={
            <Link href="/thu-chi" className={linkBtn}>
              <ExternalLink className="w-3.5 h-3.5" /> Mở Thu chi
            </Link>
          }
        >
          <Stat label="Chưa khớp" value={nf(ch.bank.unmatched)} tone={ch.bank.unmatched ? "warn" : undefined} />
          <Stat label="Chưa khớp quá 7 ngày" value={nf(ch.bank.unmatchedOver7d)} tone={ch.bank.unmatchedOver7d ? "bad" : undefined} />
          <Stat label="Lần cuối nhận webhook" value={ch.bank.lastWebhookAt ? agoLabel(ch.bank.lastWebhookAt) : "chưa có"} />
          {ch.bank.unmatchedOver7d > 0 && <p className="text-gray-400">Thủ quỹ và Trưởng nhà được nhắc mỗi tuần một lần cho tới khi xử lý xong.</p>}
        </Tile>

        <Tile
          icon={<Sparkles className="w-4 h-4" />}
          title="Trợ lý AI"
          ok={ch.ai.configured ? ch.ai.masterEnabled : false}
          okText="Đang bật"
          badText={ch.ai.configured ? "Đang tắt" : "Chưa có khóa"}
          action={
            <button type="button" className={linkBtn} onClick={() => openSettingsTab("ai")}>
              <ExternalLink className="w-3.5 h-3.5" /> Cài đặt AI
            </button>
          }
        >
          <Stat label="Lượt dùng (7 ngày)" value={nf(ch.ai.jobs7d)} />
          <Stat label="Lỗi / bị chặn" value={`${nf(ch.ai.failed7d)} / ${nf(ch.ai.blocked7d)}`} tone={ch.ai.failed7d ? "bad" : undefined} />
          {b && (
            <div className="space-y-1">
              <Stat label={`Ngân sách ${b.month.slice(5, 7)}/${b.month.slice(0, 4)}`} value={`${vnd(b.usedVnd)} / ${vnd(b.limitVnd)}`} tone={pct >= b.alertThresholdPct ? "warn" : undefined} />
              <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Ngân sách AI đã dùng">
                <div className={cn("h-full rounded-full", pct >= 100 ? "bg-rose-500" : pct >= b.alertThresholdPct ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: `${b.alertThresholdPct}%` }} title={`Ngưỡng cảnh báo ${b.alertThresholdPct}%`} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {ch.ai.providers.map((p) => (
              <Chip
                key={p.provider}
                className={!p.configured ? "bg-gray-100 text-gray-500" : p.pausedUntil ? "bg-rose-100 text-rose-700" : p.failures > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}
              >
                {p.label}:{" "}
                {!p.configured
                  ? "chưa có khóa"
                  : p.pausedUntil
                    ? `tạm dừng tới ${new Date(p.pausedUntil).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                    : p.failures > 0
                      ? `${p.failures} lỗi liên tiếp`
                      : "hoạt động"}
              </Chip>
            ))}
          </div>
          {ch.ai.lastError && (
            <p className="text-gray-400 break-words">
              Lỗi gần nhất ({whenLabel(ch.ai.lastFailedAt)}): {ch.ai.lastError}
            </p>
          )}
        </Tile>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Hạ tầng
// ---------------------------------------------------------------------
const ENV_LABEL: Record<string, string> = { production: "Production", preview: "Preview (staging)", development: "Phát triển (dev)", test: "Kiểm thử" };

function InfraCard({ inf }: { inf: InfraDto }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Môi trường", value: `${ENV_LABEL[inf.env] ?? inf.env} · ${inf.onVercel ? "Vercel" : "máy chủ tự chạy"}` },
    { label: "Phiên bản", value: inf.version ? <span className="font-mono">{inf.version}{inf.branch ? ` (${inf.branch})` : ""}</span> : "—" },
    { label: "Vùng chạy", value: inf.region ?? "—" },
    { label: "Node.js", value: <span className="font-mono">{inf.node}</span> },
    { label: "PostgreSQL", value: inf.postgres ? <span className="font-mono">{inf.postgres}</span> : "—" },
    { label: "Độ trễ CSDL (1 vòng)", value: `${nf(inf.dbLatencyMs)} ms` },
  ];
  const a = inf.audit;
  const auditOk = a.defaultRows === 0 && (a.monthsAhead === null || a.monthsAhead >= 1);
  const missingRequired = inf.envFlags.filter((f) => f.required && !f.set).length;
  return (
    <Card title="Hạ tầng & cấu hình" icon={<ServerCog className="w-4 h-4 text-primary" />}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl bg-surface/50 border border-purple-50 px-3 py-2.5 min-w-0">
            <dt className="text-[10.5px] text-gray-400">{r.label}</dt>
            <dd className="text-xs font-bold text-gray-800 truncate">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className={cn("rounded-2xl border p-3.5 flex gap-3 text-xs", auditOk ? "border-emerald-100 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
        {auditOk ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
        <div className="space-y-0.5 min-w-0">
          <p className="font-bold">Nhật ký kiểm toán (audit_logs) — phân vùng theo tháng</p>
          <p className="leading-relaxed">
            Đã có phân vùng tới tháng <b>{a.latestPartition ? `${a.latestPartition.slice(5, 7)}/${a.latestPartition.slice(0, 4)}` : "—"}</b>
            {a.monthsAhead !== null ? ` (trước ${a.monthsAhead} tháng)` : ""} · phân vùng mặc định: <b>~{nf(a.defaultRows)}</b> dòng.
            {a.defaultRows > 0 ? " Có dòng rơi vào phân vùng mặc định ⇒ phân vùng tháng chưa được tạo kịp — kiểm tra tác vụ buổi tối (dọn dẹp)." : ""}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-extrabold text-gray-900 inline-flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" /> Biến môi trường
          </p>
          <span className="text-[11px] text-gray-400">
            {inf.envFlags.filter((f) => f.set).length}/{inf.envFlags.length} đã đặt
            {missingRequired ? ` · thiếu ${missingRequired} biến nên có` : ""}
          </span>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {inf.envFlags.map((f) => {
            const bad = !f.set && f.required;
            return (
              <li key={f.key} className={cn("rounded-xl border px-3 py-2.5 min-w-0", f.set ? "border-purple-50 bg-white" : bad ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-gray-50/50")}>
                <div className="flex items-start gap-2">
                  {f.set ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" /> : bad ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-px" /> : <CircleDashed className="w-4 h-4 text-gray-400 shrink-0 mt-px" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-900 leading-tight">{f.label}</p>
                      <Chip className={f.set ? "bg-emerald-100 text-emerald-700" : bad ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}>{f.set ? "CÓ" : "KHÔNG"}</Chip>
                    </div>
                    <p className="text-[10.5px] font-mono text-gray-400 break-all">{f.key}</p>
                    {!f.set && <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{f.hint}</p>}
                    {f.note && <p className="text-[11px] text-primary leading-relaxed mt-0.5">{f.note}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Trang này chỉ biết biến có được đặt hay không — giá trị không bao giờ được gửi về trình duyệt. Đổi biến ở Vercel → Settings → Environment Variables rồi triển khai lại.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
export default function SystemTab() {
  const { showToast } = useApp();
  const { data, error, isValidating } = useSystemStatus();
  const [refreshing, setRefreshing] = useState(false);

  const level: OpsLevel = useMemo(() => {
    if (!data) return "unknown";
    if (data.summary.level === "error") return "error";
    return data.summary.level === "warn" || data.notices.length ? "warn" : "ok";
  }, [data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshSystem();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  if (error && !data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p>{errorMessage(error)}</p>
      </div>
    );
  }
  if (!data) return <FormCardsSkeleton cards={4} />;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900">Hệ thống & vận hành</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl leading-relaxed">
              Chỉ Admin thấy. Tác vụ nền, sao lưu, lỗi hệ thống, kênh gửi thông báo và cấu hình máy chủ — để biết sớm khi có gì ngừng chạy.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition disabled:opacity-60"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (refreshing || isValidating) && "animate-spin")} /> Làm mới
        </button>
      </div>

      <OverallBanner level={level} issues={data.summary.issues} notices={data.notices} />

      <JobsCard jobs={data.jobs} onVercel={data.infra.onVercel} />

      <RunsCard />

      <ErrorsCard />

      <ChannelsCard ch={data.channels} />

      <InfraCard inf={data.infra} />

      <div className="rounded-2xl border border-purple-100 bg-surface/40 p-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <span className="mr-auto">
          Số liệu lúc {new Date(data.generatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · tự làm mới mỗi 2 phút.
        </span>
        <button type="button" className={linkBtn} onClick={() => openSettingsTab("activity")}>
          <Activity className="w-3.5 h-3.5" /> Nhật ký hoạt động
        </button>
        <button type="button" className={linkBtn} onClick={() => openSettingsTab("storage")}>
          <HardDrive className="w-3.5 h-3.5" /> Dung lượng
        </button>
      </div>
    </div>
  );
}
