"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, UserPlus, ShieldCheck, UserMinus, Pencil, Copy, X, IdCard } from "lucide-react";
import { api } from "@/lib/api";
import { Portal } from "@/components/ui/Portal";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople } from "@/lib/data/members";
import { ROLE_LABEL } from "@/lib/types/session";
import type { Member } from "@/lib/types/members";

const ROLE_CODES = ["house_head", "vice_head", "treasurer", "admin", "liturgy_lead", "kitchen_lead", "media_lead", "member"];
const STATUS_LABEL: Record<string, string> = { active: "Đang ở", on_leave: "Tạm vắng", alumni: "Cựu thành viên", left: "Đã rời lưu xá" };

function SecretBox({ title, lines, onClose }: { title: string; lines: [string, string][]; onClose: () => void }) {
  const { showToast } = useApp();
  return (
    <Portal>
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <div className="p-4 rounded-2xl bg-gray-50 border text-sm space-y-1.5">
            {lines.map(([k, v]) => (
              <div key={k}>
                {k}: <code className="px-2 py-0.5 rounded bg-white border font-mono font-bold text-primary">{v}</code>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">Thông tin chỉ hiển thị một lần — không chia sẻ lên nhóm chung.</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(lines.map(([k, v]) => `${k}: ${v}`).join("\n"));
                showToast("success", "Đã sao chép.");
              }}
              className="px-3 py-2 rounded-xl border text-xs font-bold text-gray-700 inline-flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Sao chép
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">
              Đã ghi lại
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Các thao tác quản trị trên một thành viên — mỗi nút chỉ hiện khi người dùng có quyền tương ứng (server kiểm lại). */
export default function MemberAdminPanel({ member, canEdit, onEdit }: { member: Member; canEdit: boolean; onEdit: () => void }) {
  const { showToast } = useApp();
  const { can, session } = useSession();
  const [secret, setSecret] = useState<{ title: string; lines: [string, string][] } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState<string>("left");
  const [reason, setReason] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [nidOpen, setNidOpen] = useState(false);
  const [nidReason, setNidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isSelf = session?.member?.id === member.id;

  useEffect(() => {
    setRoles(null);
    setEmail(member.email ?? "");
  }, [member.id, member.email]);

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

  const canAccount = !member.userId && can(["auth.user.manage", "application.review"]);
  const canReset = !!member.userId && can("auth.user.manage") && !isSelf;
  const canRoles = !!member.userId && can("auth.role.assign");
  const canStatus = can("member.status.change") && !isSelf;
  const canNid = !!member.canRevealNationalId;
  if (!canEdit && !canAccount && !canReset && !canRoles && !canStatus && !canNid) return null;

  const btn = "py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50";

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Quản lý hồ sơ</span>
      <div className="grid grid-cols-2 gap-2">
        {canEdit && (
          <button onClick={onEdit} className={`${btn} border-purple-200 text-primary hover:bg-purple-50`}>
            <Pencil className="w-3.5 h-3.5" /> Sửa hồ sơ
          </button>
        )}
        {canAccount && (
          <button onClick={() => setAccountOpen(true)} className={`${btn} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}>
            <UserPlus className="w-3.5 h-3.5" /> Cấp tài khoản
          </button>
        )}
        {canReset && (
          <button onClick={() => setConfirmReset(true)} disabled={busy} className={`${btn} border-amber-200 text-amber-700 hover:bg-amber-50`}>
            <KeyRound className="w-3.5 h-3.5" /> Đặt lại mật khẩu
          </button>
        )}
        {canRoles && (
          <button
            onClick={() =>
              run(async () => {
                setRoles((await membersApi.roles(member.id)).roles);
                setRolesOpen(true);
              })
            }
            className={`${btn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Vai trò
          </button>
        )}
        {canStatus && (
          <button onClick={() => setStatusOpen(true)} className={`${btn} border-rose-200 text-rose-700 hover:bg-rose-50`}>
            <UserMinus className="w-3.5 h-3.5" /> Trạng thái
          </button>
        )}
        {canNid && (
          <button onClick={() => setNidOpen(true)} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
            <IdCard className="w-3.5 h-3.5" /> Xem CCCD
          </button>
        )}
      </div>

      {nidOpen && (
        <Portal>
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setNidOpen(false)}>
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-gray-900">Xem số CCCD của {member.fullName}</h3>
              <p className="text-xs text-gray-500">Dữ liệu nhạy cảm: mỗi lần xem được ghi vào nhật ký kiểm toán kèm lý do.</p>
              <CustomInput label="Lý do xem" value={nidReason} onChange={(e) => setNidReason(e.target.value)} placeholder="VD: Khai báo tạm trú với công an phường" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setNidOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold">Hủy</button>
                <button
                  disabled={busy || nidReason.trim().length < 5}
                  onClick={() =>
                    run(async () => {
                      const r = await api.post<{ nationalId: string | null }>(`/api/v1/members/${member.id}/national-id`, { reason: nidReason.trim() });
                      setNidOpen(false);
                      setNidReason("");
                      setSecret({ title: `CCCD của ${member.fullName}`, lines: [["Số CCCD", r.nationalId ?? "(chưa lưu)"]] });
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50"
                >
                  Xem
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Đặt lại mật khẩu?"
        message={`Cấp mật khẩu tạm cho ${member.fullName} và đăng xuất mọi thiết bị của tài khoản này.`}
        confirmText="Đặt lại"
        variant="warning"
        onConfirm={() =>
          run(async () => {
            const r = await membersApi.resetPassword(member.id);
            setSecret({ title: `Mật khẩu tạm của ${member.fullName}`, lines: [["Mật khẩu tạm", r.temporaryPassword]] });
          })
        }
      />

      {accountOpen && (
        <Portal>
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setAccountOpen(false)}>
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Cấp tài khoản cho {member.fullName}</h3>
                <button onClick={() => setAccountOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <CustomInput label="Email đăng nhập" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setAccountOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold">Hủy</button>
                <button
                  disabled={busy || !email.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await membersApi.createAccount(member.id, email.trim());
                      await refreshPeople();
                      setAccountOpen(false);
                      setSecret({ title: `Tài khoản của ${member.fullName}`, lines: [["Đăng nhập", r.email], ["Mật khẩu tạm", r.temporaryPassword]] });
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50"
                >
                  Tạo tài khoản
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {rolesOpen && roles && (
        <Portal>
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setRolesOpen(false)}>
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Vai trò của {member.fullName}</h3>
                <button onClick={() => setRolesOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-gray-500">Gán/thu hồi có hiệu lực ngay; mọi thay đổi được ghi nhật ký kiểm toán.</p>
              <div className="space-y-1.5">
                {ROLE_CODES.map((code) => {
                  const on = roles.includes(code);
                  return (
                    <label key={code} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <span className="text-xs font-semibold text-gray-800">{ROLE_LABEL[code]}</span>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={busy}
                        onChange={() =>
                          run(async () => {
                            const r = await membersApi.setRole(member.id, code, !on);
                            setRoles(r.roles);
                            await refreshPeople();
                            showToast("success", `${on ? "Đã thu hồi" : "Đã gán"} vai trò ${ROLE_LABEL[code]}.`);
                          })
                        }
                        className="accent-primary w-4 h-4"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {statusOpen && (
        <Portal>
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setStatusOpen(false)}>
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-gray-900">Trạng thái cư trú — {member.fullName}</h3>
              <p className="text-xs text-gray-500">Hiện tại: <b>{STATUS_LABEL[member.status]}</b>. &quot;Đã rời&quot; sẽ kết thúc phân phòng, khóa tài khoản và đăng xuất mọi thiết bị.</p>
              <CustomSelect
                label="Chuyển sang"
                value={status}
                onChange={setStatus}
                options={Object.entries(STATUS_LABEL)
                  .filter(([k]) => k !== member.status)
                  .map(([value, label]) => ({ value, label }))}
              />
              {(status === "left" || status === "alumni") && (
                <CustomInput label="Lý do / ghi chú" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tốt nghiệp, chuyển nơi ở…" />
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setStatusOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold">Hủy</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await membersApi.changeStatus(member.id, status, null, reason || null);
                      await refreshPeople();
                      setStatusOpen(false);
                      showToast("success", `Đã chuyển ${member.fullName} sang "${STATUS_LABEL[status]}".`);
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {secret && <SecretBox title={secret.title} lines={secret.lines} onClose={() => setSecret(null)} />}
    </div>
  );
}
