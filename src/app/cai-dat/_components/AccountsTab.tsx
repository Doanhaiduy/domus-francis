"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  UserPlus,
  Search,
  Lock,
  Unlock,
  UserX,
  UserCheck,
  ShieldCheck,
  Copy,
  X,
  AlertTriangle,
  Info,
  Settings2,
  Users,
} from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Portal } from "@/components/ui/Portal";
import { useApp } from "@/lib/store";
import { ListSkeleton } from "./TabSkeletons";
import { errorMessage, fileUrl } from "@/lib/api";
import { accountsApi, refreshAccounts, useAccounts } from "@/lib/data/accounts";
import {
  ACCOUNT_STATUS_LABEL,
  MEMBER_STATUS_LABEL,
  type AccountAction,
  type AccountDto,
  type AccountStatus,
  type AccountsListDto,
} from "@/lib/types/accounts";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const STATUS_BADGE: Record<AccountStatus, string> = {
  none: "bg-gray-100 text-gray-600 border-gray-200",
  invited: "bg-sky-50 text-sky-700 border-sky-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  locked: "bg-amber-50 text-amber-800 border-amber-200",
  disabled: "bg-rose-50 text-rose-700 border-rose-200",
};

type Filter = "all" | "active" | "locked" | "disabled" | "none";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang hoạt động" },
  { key: "locked", label: "Bị khóa" },
  { key: "disabled", label: "Vô hiệu" },
  { key: "none", label: "Chưa có tài khoản" },
];

/** Trạng thái hiển thị: tài khoản "đang hoạt động" nhưng bị khóa tạm do sai mật khẩu ⇒ "Bị khóa". */
const shownStatus = (a: AccountDto): AccountStatus => (a.status === "active" && a.tempLocked ? "locked" : a.status);

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "Chưa đăng nhập";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Khóa ổn định: theo hồ sơ nếu có (không đổi khi vừa cấp tài khoản — hộp mật khẩu tạm không bị đóng), không thì theo tài khoản. */
const keyOf = (a: AccountDto) => (a.memberId ? `m:${a.memberId}` : `u:${a.userId}`);

/** Cài đặt → "Tài khoản": thành viên + tài khoản đăng nhập, cấp tài khoản, đặt lại mật khẩu, khóa/vô hiệu, gán vai trò. */
export default function AccountsTab() {
  const { data, error, isLoading } = useAccounts();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, active: 0, locked: 0, disabled: 0, none: 0 };
    for (const a of items) {
      const s = shownStatus(a);
      if (s === "active" || s === "locked" || s === "disabled" || s === "none") c[s]++;
    }
    return c;
  }, [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (filter !== "all" && shownStatus(a) !== filter) return false;
      if (!q) return true;
      return (
        a.fullName.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q) ||
        a.roles.some((r) => r.name.toLowerCase().includes(q))
      );
    });
  }, [items, query, filter]);
  const selected = selectedKey ? items.find((a) => keyOf(a) === selectedKey) ?? null : null;

  if (isLoading && !data) {
    return <ListSkeleton />;
  }
  if (error && !data) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> {errorMessage(error)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tài khoản</h2>
              <p className="text-xs text-gray-500">
                {counts.all} người · {counts.active} đang hoạt động · {counts.none} chưa có tài khoản
              </p>
            </div>
          </div>
          <div className="w-full md:w-64">
            <CustomInput
              placeholder="Tìm tên, email, vai trò…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto custom-scroll -mx-1 px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[11px] font-bold border whitespace-nowrap transition",
                filter === f.key ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {f.label} <span className={filter === f.key ? "text-white/80" : "text-gray-400"}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {!data.canManage && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Bạn chỉ xem được danh sách. Cấp tài khoản, đặt lại mật khẩu, khóa/vô hiệu cần quyền quản lý tài khoản (Trưởng nhà, Admin).
          </div>
        )}

        {/* Điện thoại: dạng thẻ */}
        <div className="sm:hidden flex flex-col gap-2.5">
          {filtered.map((a) => (
            <button
              key={keyOf(a)}
              type="button"
              onClick={() => setSelectedKey(keyOf(a))}
              className="text-left rounded-2xl border border-gray-100 p-3 flex flex-col gap-2 active:bg-gray-50"
            >
              <div className="flex items-center gap-2.5">
                <Avatar a={a} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-gray-900 truncate">
                    {a.fullName}
                    {a.isSelf && <span className="ml-1 text-[10px] font-semibold text-primary">(bạn)</span>}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{a.email ?? "—"}</div>
                </div>
                <StatusBadge a={a} />
              </div>
              <RoleChips a={a} />
              <div className="text-[10.5px] text-gray-400">Đăng nhập cuối: {a.userId ? fmtDateTime(a.lastLoginAt) : "—"}</div>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-xs text-gray-400">Không có ai khớp bộ lọc.</p>}
        </div>

        {/* Màn hình rộng: bảng */}
        <div className="hidden sm:block overflow-x-auto custom-scroll">
          <table className="hidden sm:table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Thành viên</th>
                <th className="py-3 px-3">Email đăng nhập</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-3">Vai trò</th>
                <th className="py-3 px-3 whitespace-nowrap">Đăng nhập cuối</th>
                <th className="py-3 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filtered.map((a) => (
                <tr key={keyOf(a)} className="border-t border-gray-50 hover:bg-gray-50/60 align-middle">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      <Avatar a={a} />
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 truncate">
                          {a.fullName}
                          {a.isSelf && <span className="ml-1 text-[10px] font-semibold text-primary">(bạn)</span>}
                        </div>
                        <div className="text-[10.5px] text-gray-400">
                          {a.memberId ? MEMBER_STATUS_LABEL[a.memberStatus ?? ""] ?? "" : "Tài khoản không gắn hồ sơ"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 max-w-[220px] truncate">{a.email ?? "—"}</td>
                  <td className="py-2.5 px-3">
                    <StatusBadge a={a} />
                  </td>
                  <td className="py-2.5 px-3 max-w-[260px]">
                    <RoleChips a={a} />
                  </td>
                  <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{a.userId ? fmtDateTime(a.lastLoginAt) : "—"}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedKey(keyOf(a))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-purple-200 text-[11px] font-bold text-primary hover:bg-purple-50"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> {a.userId ? "Quản lý" : data.canManage ? "Cấp tài khoản" : "Xem"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    Không có ai khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] text-gray-400 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-[1px] shrink-0" />
          Mật khẩu tạm chỉ hiện một lần — người dùng phải đổi ở lần đăng nhập sau. Khóa hoặc vô hiệu sẽ đăng xuất tài khoản khỏi mọi thiết bị.
          Tài khoản giữ vai trò đặc quyền (Admin, Trưởng nhà, Thủ quỹ) chỉ Trưởng nhà hoặc Admin thao tác được.
        </p>
      </div>

      {selected && <AccountDialog account={selected} list={data} onClose={() => setSelectedKey(null)} />}
    </div>
  );
}

function Avatar({ a }: { a: AccountDto }) {
  const src = fileUrl(a.avatarFileId, "thumb");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-purple-100 text-primary text-[10px] font-black flex items-center justify-center shrink-0">
      {initials(a.displayName)}
    </span>
  );
}

function StatusBadge({ a }: { a: AccountDto }) {
  const s = shownStatus(a);
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10.5px] font-bold whitespace-nowrap", STATUS_BADGE[s])}>
      {a.status === "active" && a.tempLocked ? "Khóa tạm (sai mật khẩu)" : ACCOUNT_STATUS_LABEL[s]}
    </span>
  );
}

function RoleChips({ a }: { a: AccountDto }) {
  if (!a.userId) return <span className="text-[11px] text-gray-400">—</span>;
  const shown = a.roles.filter((r) => r.code !== "member");
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((r) => (
        <span key={r.code} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10.5px] font-semibold">
          {r.name.replace(" (quản trị kỹ thuật)", "")}
        </span>
      ))}
      {a.roles.some((r) => r.code === "member") && (
        <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 text-[10.5px] font-semibold">Thành viên</span>
      )}
      {a.roles.length === 0 && <span className="text-[11px] text-amber-700">Chưa có vai trò</span>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Hộp quản lý một tài khoản
// ---------------------------------------------------------------------
function AccountDialog({ account: a, list, onClose }: { account: AccountDto; list: AccountsListDto; onClose: () => void }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(a.contactEmail ?? "");
  const [secret, setSecret] = useState<{ title: string; lines: [string, string][] } | null>(null);
  const [confirm, setConfirm] = useState<null | "reset" | AccountAction>(null);
  // Vai trò hiển thị ngay sau khi gán/thu hồi (không chờ tải lại cả danh sách)
  const [roleCodes, setRoleCodes] = useState<string[]>(a.roles.map((r) => r.code));

  useEffect(() => setRoleCodes(a.roles.map((r) => r.code)), [a.roles]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !secret && !confirm && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, secret, confirm]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const blockedPrivileged = a.privileged && !list.canAssign;
  const canAct = list.canManage && !!a.userId && !a.isSelf && !blockedPrivileged;
  const canRoles = list.canAssign && !!a.userId && !a.isSelf;
  const btn = "py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50";

  const statusActions: { action: AccountAction; label: string; icon: React.ReactNode; cls: string }[] = [];
  if (a.userId) {
    if (a.status === "locked" || a.tempLocked)
      statusActions.push({ action: "unlock", label: "Mở khóa", icon: <Unlock className="w-3.5 h-3.5" />, cls: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" });
    else if (a.status === "active")
      statusActions.push({ action: "lock", label: "Khóa tài khoản", icon: <Lock className="w-3.5 h-3.5" />, cls: "border-amber-200 text-amber-700 hover:bg-amber-50" });
    if (a.status === "disabled")
      statusActions.push({ action: "enable", label: "Kích hoạt lại", icon: <UserCheck className="w-3.5 h-3.5" />, cls: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" });
    else statusActions.push({ action: "disable", label: "Vô hiệu hóa", icon: <UserX className="w-3.5 h-3.5" />, cls: "border-rose-200 text-rose-700 hover:bg-rose-50" });
  }

  const CONFIRM_TEXT: Record<string, { title: string; message: string; ok: string; variant: "danger" | "warning" | "info" }> = {
    reset: {
      title: "Đặt lại mật khẩu?",
      message: `Cấp mật khẩu tạm cho ${a.fullName} và đăng xuất mọi thiết bị của tài khoản này.`,
      ok: "Đặt lại",
      variant: "warning",
    },
    lock: { title: "Khóa tài khoản?", message: `${a.fullName} sẽ không đăng nhập được và bị đăng xuất khỏi mọi thiết bị cho tới khi được mở khóa.`, ok: "Khóa", variant: "warning" },
    unlock: { title: "Mở khóa tài khoản?", message: `${a.fullName} sẽ đăng nhập lại được.`, ok: "Mở khóa", variant: "info" },
    disable: {
      title: "Vô hiệu hóa tài khoản?",
      message: `Tài khoản của ${a.fullName} bị vô hiệu (dùng khi rời lưu xá hoặc tài khoản bị lộ) và đăng xuất khỏi mọi thiết bị.`,
      ok: "Vô hiệu hóa",
      variant: "danger",
    },
    enable: { title: "Kích hoạt lại tài khoản?", message: `${a.fullName} sẽ đăng nhập lại được bằng mật khẩu hiện có.`, ok: "Kích hoạt", variant: "info" },
  };
  const c = confirm ? CONFIRM_TEXT[confirm] : null;

  const doConfirm = () => {
    const what = confirm;
    setConfirm(null);
    if (!what || !a.userId) return;
    const uid = a.userId;
    void run(async () => {
      if (what === "reset") {
        const r = await accountsApi.resetPassword(uid);
        setSecret({ title: `Mật khẩu tạm của ${a.fullName}`, lines: [["Đăng nhập", a.email ?? ""], ["Mật khẩu tạm", r.temporaryPassword]] });
      } else {
        const r = await accountsApi.setStatus(uid, what);
        showToast("success", r.message);
      }
      await refreshAccounts();
    });
  };

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-2 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-auto bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[92vh] overflow-hidden"
          >
            <div className="flex items-start justify-between p-4 sm:p-6 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar a={a} />
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{a.fullName}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusBadge a={a} />
                    {a.memberId && <span className="text-[10.5px] text-gray-400">{MEMBER_STATUS_LABEL[a.memberStatus ?? ""] ?? ""}</span>}
                  </div>
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 shrink-0" aria-label="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
              {a.isSelf && (
                <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Đây là tài khoản của bạn — không thể tự khóa, vô hiệu, đặt lại mật khẩu hay đổi vai trò tại đây (đổi mật khẩu ở trang cá nhân).
                </div>
              )}
              {!a.isSelf && blockedPrivileged && list.canManage && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Tài khoản giữ vai trò đặc quyền — chỉ Trưởng nhà hoặc Admin (quyền gán vai trò) được đặt lại mật khẩu, khóa hoặc vô hiệu.
                </div>
              )}

              {!a.userId ? (
                list.canManage && a.memberId ? (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-600">Thành viên chưa có tài khoản đăng nhập. Cấp tài khoản bằng email — hệ thống tạo mật khẩu tạm hiển thị một lần.</p>
                    <CustomInput label="Email đăng nhập" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
                    <button
                      type="button"
                      disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
                      onClick={() =>
                        run(async () => {
                          const r = await accountsApi.create(a.memberId!, email.trim());
                          setSecret({ title: `Tài khoản của ${a.fullName}`, lines: [["Đăng nhập", r.email], ["Mật khẩu tạm", r.temporaryPassword]] });
                          await refreshAccounts();
                        })
                      }
                      className={`${btn} w-full bg-primary border-primary text-white hover:bg-[#4d2dbf]`}
                    >
                      <UserPlus className="w-4 h-4" /> Cấp tài khoản
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Thành viên chưa có tài khoản đăng nhập.</p>
                )
              ) : (
                <>
                  <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-xs">
                    <dt className="text-gray-400">Email</dt>
                    <dd className="text-gray-800 font-semibold break-all">{a.email ?? "—"}</dd>
                    <dt className="text-gray-400">Đăng nhập cuối</dt>
                    <dd className="text-gray-800">{fmtDateTime(a.lastLoginAt)}</dd>
                    {a.mustChangePassword && (
                      <>
                        <dt className="text-gray-400">Mật khẩu</dt>
                        <dd className="text-amber-700">Đang dùng mật khẩu tạm — phải đổi khi đăng nhập</dd>
                      </>
                    )}
                    {a.tempLocked && a.lockedUntil && (
                      <>
                        <dt className="text-gray-400">Khóa tạm tới</dt>
                        <dd className="text-amber-700">{fmtDateTime(a.lockedUntil)}</dd>
                      </>
                    )}
                  </dl>

                  {list.canManage && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy || !canAct}
                        onClick={() => setConfirm("reset")}
                        className={`${btn} border-amber-200 text-amber-700 hover:bg-amber-50 col-span-2 sm:col-span-1`}
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Đặt lại mật khẩu
                      </button>
                      {statusActions.map((s) => (
                        <button key={s.action} type="button" disabled={busy || !canAct} onClick={() => setConfirm(s.action)} className={`${btn} ${s.cls}`}>
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Vai trò */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                      <ShieldCheck className="w-4 h-4 text-primary" /> Vai trò
                    </div>
                    {list.canAssign ? (
                      <div className="space-y-1.5">
                        {list.assignableRoles.map((r) => {
                          const on = roleCodes.includes(r.code);
                          const lockedAdmin = r.code === "admin" && !on && !list.canAssignAdmin;
                          const disabled = busy || !canRoles || lockedAdmin;
                          return (
                            <label
                              key={r.code}
                              className={cn(
                                "flex items-center justify-between gap-3 p-2.5 rounded-xl border border-gray-100",
                                disabled ? "opacity-60" : "hover:bg-gray-50 cursor-pointer",
                              )}
                              title={lockedAdmin ? "Chỉ Admin được gán vai trò Admin" : r.description ?? undefined}
                            >
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold text-gray-800">{r.name}</span>
                                <span className="block text-[10px] text-gray-400">
                                  {r.isSystem ? "Vai trò hệ thống" : "Vai trò tự tạo"}
                                  {lockedAdmin ? " · chỉ Admin gán được" : ""}
                                </span>
                              </span>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={disabled}
                                onChange={() =>
                                  run(async () => {
                                    const res = await accountsApi.setRole(a.userId!, r.code, !on);
                                    setRoleCodes(res.roles);
                                    showToast("success", `${on ? "Đã thu hồi" : "Đã gán"} vai trò ${r.name}.`);
                                    await refreshAccounts();
                                  })
                                }
                                className="accent-primary w-4 h-4 shrink-0"
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <RoleChips a={a} />
                    )}
                    {!list.canAssign && <p className="text-[10.5px] text-gray-400">Gán/thu hồi vai trò cần quyền của Trưởng nhà hoặc Admin.</p>}
                  </div>
                </>
              )}
            </div>
            <div className="p-3 sm:p-4 sm:px-6 border-t border-gray-100 shrink-0 flex justify-end bg-gray-50/70">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>

      {c && (
        <ConfirmDialog isOpen onClose={() => setConfirm(null)} onConfirm={doConfirm} title={c.title} message={c.message} confirmText={c.ok} variant={c.variant} />
      )}
      {secret && <SecretBox title={secret.title} lines={secret.lines} onClose={() => setSecret(null)} />}
    </Portal>
  );
}

function SecretBox({ title, lines, onClose }: { title: string; lines: [string, string][]; onClose: () => void }) {
  const { showToast } = useApp();
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <div className="p-4 rounded-2xl bg-gray-50 border text-sm space-y-1.5">
          {lines.map(([k, v]) => (
            <div key={k} className="break-all">
              {k}: <code className="px-2 py-0.5 rounded bg-white border font-mono font-bold text-primary">{v}</code>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">Thông tin chỉ hiển thị một lần — gửi riêng cho người dùng, không chia sẻ lên nhóm chung.</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(lines.map(([k, v]) => `${k}: ${v}`).join("\n"));
              showToast("success", "Đã sao chép.");
            }}
            className="px-3 py-2 rounded-xl border text-xs font-bold text-gray-700 inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Sao chép
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">
            Đã ghi lại
          </button>
        </div>
      </div>
    </div>
  );
}
