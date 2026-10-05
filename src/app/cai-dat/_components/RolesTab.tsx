"use client";

import React, { useMemo, useState } from "react";
import { ShieldCheck, ChevronRight, Search, Users, AlertTriangle, Check, Info } from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { useSession } from "@/lib/session";
import { fileUrl, errorMessage } from "@/lib/api";
import type { RbacMatrixDto, RoleDto } from "@/lib/types/settings";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

interface Props {
  matrix: RbacMatrixDto | undefined;
  isLoading: boolean;
  error: unknown;
}

export default function RolesTab({ matrix, isLoading, error }: Props) {
  const { session } = useSession();
  const myRoles = session?.roles ?? [];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ setting: true });
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  const roles = matrix?.roles ?? [];
  const modules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (matrix?.modules ?? [])
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            (!sensitiveOnly || p.isSensitive) &&
            (!q || p.description.toLowerCase().includes(q) || p.code.includes(q) || m.label.toLowerCase().includes(q)),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [matrix, query, sensitiveOnly]);
  const searching = query.trim().length > 0 || sensitiveOnly;
  const allOpen = modules.length > 0 && modules.every((m) => open[m.code]);
  const totalPerms = (matrix?.modules ?? []).reduce((n, m) => n + m.permissions.length, 0);

  if (isLoading && !matrix) {
    return <div className="bg-white rounded-3xl p-10 border border-purple-50 text-center text-xs text-gray-400">Đang tải ma trận phân quyền…</div>;
  }
  if (error && !matrix) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Không tải được ma trận phân quyền: {errorMessage(error)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Ma trận Phân quyền &amp; Trách nhiệm Nội bộ</h2>
              <p className="text-xs text-gray-500">
                Sinh trực tiếp từ dữ liệu phân quyền của hệ thống: {roles.length} vai trò × {totalPerms} quyền nguyên tử, nhóm theo phân hệ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <CustomInput
                placeholder="Tìm quyền, mã quyền..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
            <button
              type="button"
              onClick={() => setSensitiveOnly((s) => !s)}
              className={cn(
                "px-3 py-2.5 rounded-xl text-[11px] font-bold border transition whitespace-nowrap",
                sensitiveOnly ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              Quyền nhạy cảm
            </button>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? {} : Object.fromEntries(modules.map((m) => [m.code, true])))}
              className="px-3 py-2.5 rounded-xl text-[11px] font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              {allOpen ? "Thu gọn tất cả" : "Mở tất cả"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-left text-xs border-collapse min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3 min-w-[260px]">Phân hệ / Quyền</th>
                {roles.map((r) => (
                  <th
                    key={r.code}
                    className={cn("py-3 px-2 text-center align-bottom", myRoles.includes(r.code) && "bg-purple-50/70 text-primary rounded-t-xl")}
                  >
                    <div className="leading-tight normal-case text-[10.5px]">{r.name.replace(" (quản trị kỹ thuật)", "")}</div>
                    <div className="mt-0.5 text-[9px] font-semibold text-gray-400 normal-case">
                      {r.permissionCount} quyền{myRoles.includes(r.code) ? " · bạn" : ""}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700 font-medium">
              {modules.map((m) => {
                const expanded = searching || !!open[m.code];
                return (
                  <React.Fragment key={m.code}>
                    <tr
                      className="border-t border-gray-100 bg-surface-container-low/60 hover:bg-purple-50/50 cursor-pointer"
                      onClick={() => setOpen((o) => ({ ...o, [m.code]: !o[m.code] }))}
                    >
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", expanded && "rotate-90 text-primary")} />
                          {m.label}
                          <span className="text-[10px] font-semibold text-gray-400">({m.permissions.length})</span>
                        </span>
                      </td>
                      {roles.map((r) => {
                        const n = m.permissions.filter((p) => p.roles.includes(r.code)).length;
                        return (
                          <td key={r.code} className={cn("py-2.5 px-2 text-center", myRoles.includes(r.code) && "bg-purple-50/70")}>
                            <span
                              className={cn(
                                "inline-block min-w-[42px] px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap",
                                n === 0
                                  ? "text-gray-300"
                                  : n === m.permissions.length
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-emerald-50 text-emerald-600",
                              )}
                            >
                              {n === 0 ? "—" : n === m.permissions.length ? "Toàn quyền" : `${n}/${m.permissions.length}`}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {expanded &&
                      m.permissions.map((p) => (
                        <tr key={p.code} className="border-t border-gray-50 hover:bg-gray-50/60">
                          <td className="py-2 px-3 pl-8">
                            <div className="text-[11.5px] text-gray-800 leading-snug">
                              {p.description}
                              {p.isSensitive && (
                                <span className="ml-1.5 align-middle px-1.5 py-[1px] rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-100">
                                  Nhạy cảm
                                </span>
                              )}
                            </div>
                            <div className="text-[9.5px] font-mono text-gray-400">{p.code}</div>
                          </td>
                          {roles.map((r) => (
                            <td key={r.code} className={cn("py-2 px-2 text-center", myRoles.includes(r.code) && "bg-purple-50/70")}>
                              {p.roles.includes(r.code) ? (
                                <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center">
                                  <Check className="w-3 h-3" strokeWidth={3} />
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
              {modules.length === 0 && (
                <tr>
                  <td colSpan={roles.length + 1} className="py-10 text-center text-gray-400">
                    Không có quyền nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] text-gray-400 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-[1px] shrink-0" />
          Ma trận chỉ đọc — quyền của từng vai trò do thiết kế hệ thống quy định (bảng role_permissions). Gán/thu hồi vai trò cho từng người thực hiện
          ở màn hình Thành viên (quyền auth.role.assign). Mỗi người có thể giữ nhiều vai trò; quyền thực tế là hợp các vai trò.
        </p>
      </div>

      {/* Người giữ vai trò */}
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Người đang giữ vai trò</h2>
            <p className="text-xs text-gray-500">Phân công vai trò còn hiệu lực trong hệ thống</p>
          </div>
        </div>
        {matrix?.holdersVisibility === "own" && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Vì quyền riêng tư, bạn chỉ thấy vai trò của chính mình. Danh sách đầy đủ hiển thị cho Admin và Trưởng nhà (quyền xem tài khoản / gán vai
              trò).
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {roles.map((r) => (
            <RoleCard key={r.code} role={r} mine={myRoles.includes(r.code)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleCard({ role, mine }: { role: RoleDto; mine: boolean }) {
  const max = role.code === "member" ? 12 : 6;
  return (
    <div className={cn("rounded-2xl border p-4 flex flex-col gap-2.5", mine ? "border-purple-200 bg-purple-50/40" : "border-gray-100 bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 leading-tight">{role.name}</h3>
          <p className="text-[10px] font-mono text-gray-400">
            {role.code} · {role.permissionCount} quyền
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 shrink-0">{role.holders.length}</span>
      </div>
      {role.description && <p className="text-[11px] text-gray-500 leading-snug line-clamp-3">{role.description.replace(/^\[ĐỀ XUẤT\]\s*/, "")}</p>}
      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        {role.holders.slice(0, max).map((h) => {
          const src = fileUrl(h.avatarFileId, "thumb");
          return (
            <span
              key={h.userId}
              className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10.5px] font-semibold text-gray-700"
              title={h.fullName ?? h.name}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-purple-100 text-primary text-[8.5px] font-black flex items-center justify-center">
                  {initials(h.name)}
                </span>
              )}
              {h.name}
            </span>
          );
        })}
        {role.holders.length > max && <span className="text-[10.5px] text-gray-400 self-center">+{role.holders.length - max}</span>}
        {role.holders.length === 0 && <span className="text-[10.5px] text-gray-400 italic">Chưa thấy ai giữ vai trò này</span>}
      </div>
    </div>
  );
}
