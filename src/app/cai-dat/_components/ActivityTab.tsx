"use client";

// Nhật ký hoạt động người dùng — CHỈ Admin (quyền activity.log.read): ai làm gì, lúc nào, từ thiết bị/IP nào.
//   • Thao tác: mọi thao tác ghi qua API (không lưu nội dung gửi lên)
//   • Đăng nhập: thành công / thất bại
//   • Thay đổi dữ liệu: giá trị trước → sau (audit_logs; hồ sơ cá nhân nhạy cảm chỉ Trưởng nhà xem được)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Loader2, LogIn, PencilLine, RefreshCw, Search, ShieldAlert, Users, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { CustomSelect } from "@/components/ui/FormControls";
import { ACTIVITY_AREAS } from "@/lib/activity-labels";
import type { ActivityActionDto, ActivityActor, ActivityChangeDto, ActivityLoginDto, ActivityPage, ActivityUserDto } from "@/lib/types/activity";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "./TabSkeletons";

type Sub = "actions" | "logins" | "changes";
type Range = "today" | "7d" | "30d" | "all";
type Result = "all" | "ok" | "error";

const SUBS: { key: Sub; label: string; icon: React.ReactNode }[] = [
  { key: "actions", label: "Thao tác", icon: <Activity className="w-3.5 h-3.5" /> },
  { key: "logins", label: "Đăng nhập", icon: <LogIn className="w-3.5 h-3.5" /> },
  { key: "changes", label: "Thay đổi dữ liệu", icon: <PencilLine className="w-3.5 h-3.5" /> },
];

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "all", label: "Tất cả" },
];

function rangeStart(r: Range): string | undefined {
  const d = new Date();
  if (r === "all") return undefined;
  if (r === "today") d.setHours(0, 0, 0, 0);
  else d.setTime(d.getTime() - (r === "7d" ? 7 : 30) * 24 * 3600 * 1000);
  return d.toISOString();
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const dateTimeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Who({ actor }: { actor: ActivityActor }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 shrink-0 rounded-full bg-purple-100 text-primary text-[11px] font-black flex items-center justify-center">{initials(actor.name) || "?"}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-900 truncate">{actor.name}</p>
        {actor.email && actor.email !== actor.name && <p className="text-[10.5px] text-gray-400 truncate">{actor.email}</p>}
      </div>
    </div>
  );
}

/** Tải danh sách theo con trỏ: đổi bộ lọc thì tải lại từ đầu, "Xem thêm" nối trang kế. */
function usePaged<T>(path: string, params: Record<string, string | undefined>, enabled: boolean) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify([path, params]);

  const build = (before?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, before })) if (v) sp.set(k, v);
    return `${path}?${sp.toString()}`;
  };

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.get<ActivityPage<T>>(build());
      if (id !== seq.current) return;
      setItems(page.items);
      setNext(page.next);
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (enabled) void load();
  }, [load, enabled]);

  const loadMore = async () => {
    if (!next) return;
    const id = seq.current;
    setMore(true);
    try {
      const page = await api.get<ActivityPage<T>>(build(next));
      if (id !== seq.current) return;
      setItems((cur) => [...cur, ...page.items]);
      setNext(page.next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  };

  return { items, next, loading, more, error, reload: load, loadMore };
}

function DayHeader({ iso }: { iso: string }) {
  return <div className="px-4 py-2 bg-gray-50/80 text-[11px] font-bold text-gray-500 capitalize sticky top-0">{dayOf(iso)}</div>;
}

function ResultBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap", ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200")}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {text}
    </span>
  );
}

function Meta({ ip, device }: { ip: string | null; device: string }) {
  return (
    <p className="text-[10.5px] text-gray-400 truncate">
      {device}
      {ip ? ` · ${ip}` : ""}
    </p>
  );
}

function ActionRow({ a }: { a: ActivityActionDto }) {
  return (
    <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,12rem)] gap-x-4 gap-y-1.5 items-center">
      <Who actor={a.actor} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-900">{a.label}</span>
          <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-primary text-[10px] font-bold">{a.areaLabel}</span>
          <ResultBadge ok={a.ok} text={a.ok ? "Thành công" : `Lỗi ${a.status}${a.errorCode ? ` · ${a.errorCode}` : ""}`} />
        </div>
        <p className="text-[10.5px] text-gray-400 font-mono truncate mt-0.5" title={`${a.method} ${a.path}`}>
          {a.method} {a.path.replace(/^\/api\/v1/, "")}
        </p>
      </div>
      <div className="min-w-0 md:text-right">
        <p className="text-xs font-semibold text-gray-700 tabular-nums">{timeOf(a.at)}{a.durationMs != null ? <span className="text-gray-400 font-normal"> · {a.durationMs}ms</span> : null}</p>
        <Meta ip={a.ip} device={a.device} />
      </div>
    </div>
  );
}

function LoginRow({ l }: { l: ActivityLoginDto }) {
  return (
    <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,12rem)] gap-x-4 gap-y-1.5 items-center">
      {l.actor.userId ? <Who actor={l.actor} /> : <p className="text-xs font-bold text-gray-700 truncate">{l.identifier}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <ResultBadge ok={l.success} text={l.success ? "Đăng nhập thành công" : (l.reasonLabel ?? "Thất bại")} />
        {!l.actor.userId && <span className="text-[10.5px] text-gray-400">chưa khớp tài khoản nào</span>}
        {l.actor.userId && <span className="text-[10.5px] text-gray-400 truncate">nhập: {l.identifier}</span>}
      </div>
      <div className="min-w-0 md:text-right">
        <p className="text-xs font-semibold text-gray-700 tabular-nums">{timeOf(l.at)}</p>
        <Meta ip={l.ip} device={l.device} />
      </div>
    </div>
  );
}

const SHOWN = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

function ChangeRow({ c }: { c: ActivityChangeDto }) {
  const [open, setOpen] = useState(false);
  const fields = c.changedFields.length ? c.changedFields : Object.keys((c.newData ?? c.oldData ?? {}) as object);
  const tone = c.action === "DELETE" ? "bg-rose-50 text-rose-700 border-rose-200" : c.action === "INSERT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,12rem)] gap-x-4 gap-y-1.5 items-center hover:bg-gray-50/70">
        <Who actor={c.actor} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("px-2 py-0.5 rounded-full border text-[10px] font-bold", tone)}>{c.actionLabel}</span>
            <span className="text-xs font-bold text-gray-900">{c.entityLabel}</span>
          </div>
          {fields.length > 0 && <p className="text-[10.5px] text-gray-400 truncate mt-0.5">{fields.slice(0, 8).join(", ")}{fields.length > 8 ? "…" : ""}</p>}
        </div>
        <div className="flex md:justify-end items-center gap-2 min-w-0">
          <div className="md:text-right min-w-0">
            <p className="text-xs font-semibold text-gray-700 tabular-nums">{timeOf(c.at)}</p>
            {c.ip && <p className="text-[10.5px] text-gray-400 truncate">{c.ip}</p>}
          </div>
          <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 -mt-1">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 divide-y divide-gray-100 text-[11px]">
            {fields.length === 0 && <p className="p-3 text-gray-400">Không có chi tiết.</p>}
            {fields.map((f) => (
              <div key={f} className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-0.5 p-2.5">
                <span className="font-mono font-bold text-gray-700 break-all">{f}</span>
                <span className="text-rose-700/90 break-words">{c.action === "INSERT" ? "" : SHOWN(c.oldData?.[f])}</span>
                <span className="text-emerald-700 break-words">{c.action === "DELETE" ? "" : SHOWN(c.newData?.[f])}</span>
              </div>
            ))}
            {c.entityId && <p className="p-2.5 text-gray-400 font-mono break-all">Mã bản ghi: {c.entityId}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedList<T extends { id: string; at: string }>({
  state,
  render,
  empty,
}: {
  state: ReturnType<typeof usePaged<T>>;
  render: (item: T) => React.ReactNode;
  empty: string;
}) {
  const { items, loading, error, next, more, loadMore, reload } = state;
  if (loading && items.length === 0) return <ListSkeleton rows={6} />;
  if (error && items.length === 0)
    return (
      <div className="p-4 rounded-2xl border border-rose-100 bg-rose-50/60 text-xs text-rose-700 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</span>
        <button onClick={() => void reload()} className="font-bold underline">Thử lại</button>
      </div>
    );
  if (items.length === 0) return <div className="py-12 text-center text-xs text-gray-500 bg-white rounded-3xl border border-dashed border-gray-200">{empty}</div>;
  let prev = "";
  return (
    <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
      <div className={cn("divide-y divide-gray-50", loading && "opacity-60")}>
        {items.map((it) => {
          const k = dayKey(it.at);
          const header = k !== prev;
          prev = k;
          return (
            <React.Fragment key={it.id}>
              {header && <DayHeader iso={it.at} />}
              {render(it)}
            </React.Fragment>
          );
        })}
      </div>
      {next && (
        <div className="p-3 border-t border-gray-50 flex justify-center">
          <button onClick={() => void loadMore()} disabled={more} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-700 disabled:opacity-60">
            {more && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
          </button>
        </div>
      )}
    </div>
  );
}

export default function ActivityTab() {
  const [sub, setSub] = useState<Sub>("actions");
  const [range, setRange] = useState<Range>("7d");
  const [userId, setUserId] = useState("");
  const [result, setResult] = useState<Result>("all");
  const [area, setArea] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [users, setUsers] = useState<ActivityUserDto[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Điểm đầu khoảng thời gian: tính lại khi đổi khoảng hoặc bấm "Làm mới" (không đổi theo từng lần render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const from = useMemo(() => rangeStart(range), [range, tick]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ users: ActivityUserDto[] }>(`/api/v1/activity/users${from ? `?from=${encodeURIComponent(from)}` : ""}`)
      .then((r) => alive && setUsers(r.users))
      .catch(() => alive && setUsers([]));
    return () => {
      alive = false;
    };
  }, [from]);

  const common = { userId: userId || undefined, from, q: qDebounced || undefined };
  const actions = usePaged<ActivityActionDto>("/api/v1/activity", { ...common, result: result === "all" ? undefined : result, area: area || undefined }, sub === "actions");
  const logins = usePaged<ActivityLoginDto>("/api/v1/activity/logins", { ...common, result: result === "all" ? undefined : result }, sub === "logins");
  const changes = usePaged<ActivityChangeDto>("/api/v1/activity/changes", common, sub === "changes");
  const active = sub === "actions" ? actions : sub === "logins" ? logins : changes;

  const totals = useMemo(() => {
    const list = users ?? [];
    return { users: list.length, total: list.reduce((s, u) => s + u.total, 0), errors: list.reduce((s, u) => s + u.errors, 0) };
  }, [users]);
  const picked = users?.find((u) => u.userId === userId) ?? null;

  const userOptions = [{ value: "", label: "Tất cả người dùng" }, ...(users ?? []).map((u) => ({ value: u.userId, label: u.name, subLabel: `${u.total} thao tác` }))];
  const areaOptions = [{ value: "", label: "Mọi phân hệ" }, ...Object.entries(ACTIVITY_AREAS).filter(([k]) => k !== "other").map(([value, label]) => ({ value, label }))];
  const resultOptions: { value: Result; label: string }[] = [
    { value: "all", label: "Mọi kết quả" },
    { value: "ok", label: "Thành công" },
    { value: "error", label: sub === "logins" ? "Thất bại" : "Bị lỗi / từ chối" },
  ];

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-gray-900">Nhật ký hoạt động</h2>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Chỉ Admin xem được. Ghi lại ai thực hiện thao tác gì, lúc nào, từ thiết bị nào — <b>không lưu nội dung</b> người dùng nhập (mật khẩu, số điện thoại…). Giữ 180 ngày.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setTick((t) => t + 1);
              void active.reload();
            }}
            className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-bold text-gray-700"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", active.loading && "animate-spin")} /> Làm mới
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Người hoạt động", value: totals.users, icon: <Users className="w-4 h-4" />, cls: "text-primary bg-purple-50" },
            { label: "Thao tác", value: totals.total, icon: <Activity className="w-4 h-4" />, cls: "text-sky-700 bg-sky-50" },
            { label: "Bị lỗi / từ chối", value: totals.errors, icon: <AlertTriangle className="w-4 h-4" />, cls: totals.errors ? "text-rose-700 bg-rose-50" : "text-gray-500 bg-gray-50" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-100 p-3 flex items-center gap-2.5 min-w-0">
              <span className={cn("w-8 h-8 shrink-0 rounded-lg flex items-center justify-center", s.cls)}>{s.icon}</span>
              <div className="min-w-0">
                <p className="text-base font-black text-gray-900 leading-none tabular-nums">{users ? s.value : "…"}</p>
                <p className="text-[10px] text-gray-500 mt-1 truncate">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-xl w-full sm:w-fit overflow-x-auto">
          {SUBS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSub(s.key)}
              className={cn(
                "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition",
                sub === s.key ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900",
              )}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CustomSelect value={userId} onChange={setUserId} options={userOptions} placeholder="Người dùng" />
          <CustomSelect value={range} onChange={(v) => setRange(v as Range)} options={RANGES} />
          {sub === "actions" ? (
            <CustomSelect value={area} onChange={setArea} options={areaOptions} />
          ) : sub === "logins" ? (
            <CustomSelect value={result} onChange={(v) => setResult(v as Result)} options={resultOptions} />
          ) : (
            <div className="hidden lg:block" />
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={sub === "actions" ? "Tìm thao tác, tên, đường dẫn…" : sub === "logins" ? "Tìm email, IP, tên…" : "Tìm tên bảng, mã bản ghi…"}
              className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary"
            />
          </div>
        </div>
        {sub === "actions" && (
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <span className="text-[11px] text-gray-500">Kết quả:</span>
            {resultOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setResult(o.value)}
                className={cn("px-2.5 py-1 rounded-full border text-[11px] font-bold transition", result === o.value ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary/40")}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {picked && (
          <p className="text-[11px] text-gray-500">
            <b className="text-gray-700">{picked.name}</b>: {picked.total} thao tác{picked.errors ? `, ${picked.errors} lỗi` : ""} · hoạt động gần nhất {dateTimeOf(picked.lastAt)} · đăng nhập gần nhất {dateTimeOf(picked.lastLoginAt)}
          </p>
        )}
      </div>

      {sub === "actions" && <FeedList state={actions} render={(a) => <ActionRow a={a} />} empty="Chưa có thao tác nào trong khoảng thời gian này." />}
      {sub === "logins" && <FeedList state={logins} render={(l) => <LoginRow l={l} />} empty="Chưa có lượt đăng nhập nào trong khoảng thời gian này." />}
      {sub === "changes" && (
        <>
          <FeedList state={changes} render={(c) => <ChangeRow c={c} />} empty="Chưa có thay đổi dữ liệu nào trong khoảng thời gian này." />
          <p className="text-[11px] text-gray-400 px-1">Dữ liệu cá nhân nhạy cảm (hồ sơ, điểm học tập…) chỉ Trưởng nhà xem được nên không hiện ở đây.</p>
        </>
      )}
    </div>
  );
}
