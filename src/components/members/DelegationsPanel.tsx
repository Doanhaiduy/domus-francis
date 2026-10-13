"use client";

// Ủy quyền vai trò tạm thời (Cài đặt → Phân quyền): người giữ vai trò (Trưởng nhà, Thủ quỹ…) giao vai trò của mình cho một thành viên trong
// khoảng ngày (tối đa 60 ngày) kèm lý do, vd. "về quê dịp Tết". Người được ủy quyền có quyền của vai trò trong khoảng đó; thu hồi sớm bất cứ lúc nào.
import React, { useMemo, useState } from "react";
import { CalendarClock, Loader2, Plus, Undo2, UserRoundCog, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { vnToday } from "@/lib/vn-time";
import { delegationsApi, useDelegations } from "@/lib/data/delegations";
import { DELEGATION_MAX_DAYS, DELEGATION_PHASE_LABEL, type DelegationDto, type DelegationPhase } from "@/lib/types/delegations";
import { cn } from "@/lib/utils";

const PHASE_STYLE: Record<DelegationPhase, string> = {
  active: "bg-emerald-50 text-emerald-700",
  upcoming: "bg-sky-50 text-sky-700",
  ended: "bg-gray-100 text-gray-500",
  revoked: "bg-rose-50 text-rose-600",
};
const dmy = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

function CreateDialog({ roles, onClose }: { roles: { code: string; name: string }[]; onClose: () => void }) {
  const { members, showToast } = useApp();
  const today = vnToday();
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? "");
  const [delegate, setDelegate] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDays(today, 6));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(
    () => members.filter((m) => m.userId && (m.status === "active" || m.status === "on_leave")).map((m) => ({ value: m.id, label: m.fullName, subLabel: m.room ?? undefined })),
    [members]
  );
  const days = Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86400e3) + 1;
  const bad = !roleCode || !delegate || reason.trim().length < 5 || !startsOn || !endsOn || endsOn < startsOn || days > DELEGATION_MAX_DAYS;

  const submit = async () => {
    setBusy(true);
    try {
      await delegationsApi.create({ roleCode, delegateMemberId: delegate, startsOn, endsOn, reason: reason.trim() });
      showToast("success", "Đã ủy quyền — người nhận được thông báo và có quyền của vai trò trong khoảng ngày đã chọn.");
      onClose();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
        <div role="dialog" aria-modal="true" aria-label="Ủy quyền vai trò" className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-gray-900">Ủy quyền vai trò tạm thời</h3>
              <p className="text-xs text-gray-500 mt-0.5">Tối đa {DELEGATION_MAX_DAYS} ngày. Bạn vẫn giữ vai trò của mình; người nhận có thêm quyền của vai trò đó trong khoảng ngày này.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-3.5">
            <CustomSelect label="Vai trò ủy quyền" value={roleCode} onChange={setRoleCode} options={roles.map((r) => ({ value: r.code, label: r.name }))} />
            <CustomSelect label="Giao cho" value={delegate} onChange={setDelegate} options={candidates} placeholder="Chọn thành viên (có tài khoản)…" />
            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Từ ngày" format="YYYY-MM-DD" value={startsOn} onChange={(d) => d && setStartsOn(d)} />
              <CustomDatePicker label="Đến hết ngày" format="YYYY-MM-DD" value={endsOn} onChange={(d) => d && setEndsOn(d)} />
            </div>
            {days > DELEGATION_MAX_DAYS && <p className="text-[11px] text-rose-600 font-semibold">Khoảng ngày dài {days} ngày — tối đa {DELEGATION_MAX_DAYS} ngày.</p>}
            <CustomInput label="Lý do *" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="VD: Về quê dịp Tết" />
          </div>
          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">Hủy</button>
            <button type="button" onClick={submit} disabled={busy || bad} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ủy quyền
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function DelegationsPanel() {
  const { showToast } = useApp();
  const { data, isLoading } = useDelegations();
  const [creating, setCreating] = useState(false);
  const [toRevoke, setToRevoke] = useState<DelegationDto | null>(null);
  const items = data?.items ?? [];
  if (isLoading || (!data?.canDelegate && items.length === 0)) return null; // không liên quan đến người xem ⇒ ẩn hẳn

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0"><UserRoundCog className="w-4 h-4" /></span>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-sm">Ủy quyền tạm thời</h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">Khi bạn đi vắng, giao vai trò của mình (Trưởng nhà, Thủ quỹ…) cho một thành viên trong tối đa {DELEGATION_MAX_DAYS} ngày. Người nhận có quyền của vai trò đó trong khoảng ngày; bạn thu hồi sớm được bất cứ lúc nào.</p>
          </div>
        </div>
        {data?.canDelegate && (
          <button type="button" onClick={() => setCreating(true)} className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container transition active:scale-95">
            <Plus className="w-4 h-4" /> Ủy quyền
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Chưa có ủy quyền nào trong 90 ngày qua.</p>
      ) : (
        <ul className="grid gap-2.5 xl:grid-cols-2">
          {items.map((d) => (
            <li key={d.id} className="rounded-2xl border border-gray-100 p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">{d.roleName}</p>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", PHASE_STYLE[d.phase])}>{DELEGATION_PHASE_LABEL[d.phase]}</span>
              </div>
              <p className="text-xs text-gray-700">
                <b>{d.delegatorName}</b>{d.asDelegator ? " (tôi)" : ""} → <b>{d.delegateName}</b>{d.asDelegate ? " (tôi)" : ""}
              </p>
              <p className="text-[11px] text-gray-500 inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> {dmy(d.startsAt)} – {dmy(d.endsAt)}</p>
              <p className="text-xs text-gray-600">{d.reason}</p>
              {d.revokedAt && <p className="text-[11px] text-rose-600">Thu hồi {dmy(d.revokedAt)}{d.revokedByName ? ` bởi ${d.revokedByName}` : ""}</p>}
              {d.canRevoke && (
                <button type="button" onClick={() => setToRevoke(d)} className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700">
                  <Undo2 className="w-3 h-3" /> Thu hồi sớm
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && data && <CreateDialog roles={data.myRoles} onClose={() => setCreating(false)} />}
      <ConfirmDialog
        isOpen={!!toRevoke}
        onClose={() => setToRevoke(null)}
        title="Thu hồi ủy quyền?"
        message={toRevoke ? `${toRevoke.delegateName} sẽ không còn quyền của vai trò ${toRevoke.roleName} do ủy quyền này, ngay lập tức.` : ""}
        confirmText="Thu hồi"
        variant="warning"
        onConfirm={async () => {
          if (!toRevoke) return;
          try {
            await delegationsApi.revoke(toRevoke.id);
            showToast("success", "Đã thu hồi ủy quyền.");
          } catch (e) {
            showToast("error", errorMessage(e));
          }
        }}
      />
    </div>
  );
}
