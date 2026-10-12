"use client";

// Cho một thành viên rời lưu xá / chuyển thành cựu thành viên: hiện các việc còn treo của người đó (khoản quỹ chưa đóng, tuần trực sắp tới,
// hình phạt đang mở, đơn xin phép đang chờ) để người quản lý chọn cách xử lý, xác nhận MỘT lần (máy chủ làm trong một giao dịch).
import React, { useEffect, useState } from "react";
import { Loader2, UserMinus, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople } from "@/lib/data/members";
import { LEAVE_KIND_LABEL } from "@/lib/types/leave";
import type { DepartureChecklistDto } from "@/lib/types/members-lifecycle";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 space-y-2.5">
      <p className="text-xs font-extrabold text-gray-700">{title}</p>
      {children}
    </div>
  );
}

export default function DepartureDialog({ memberId, memberName, initialStatus, onClose }: { memberId: string; memberName: string; initialStatus: "left" | "alumni"; onClose: () => void }) {
  const { showToast } = useApp();
  const [cl, setCl] = useState<DepartureChecklistDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"left" | "alumni">(initialStatus);
  const [leftOn, setLeftOn] = useState("");
  const [reason, setReason] = useState("");
  const [waiveDues, setWaiveDues] = useState(false);
  const [removeDuty, setRemoveDuty] = useState(true);
  const [waiveDiscipline, setWaiveDiscipline] = useState(true);
  const [cancelLeaves, setCancelLeaves] = useState(true);
  const [createAlumni, setCreateAlumni] = useState(initialStatus === "alumni");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    membersApi
      .departureChecklist(memberId)
      .then((r) => live && setCl(r))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [memberId]);
  useEffect(() => setCreateAlumni((v) => (status === "alumni" ? true : v)), [status]);

  const submit = async () => {
    if (!cl) return;
    setBusy(true);
    try {
      const r = await membersApi.depart(memberId, {
        status,
        leftOn: leftOn || null,
        reason: reason.trim() || null,
        waiveDues: waiveDues && cl.dues.items.length > 0,
        removeDutyWeeks: removeDuty && cl.dutyWeeks.items.length > 0,
        waiveDiscipline: waiveDiscipline && cl.discipline.items.length > 0,
        cancelLeaves: cancelLeaves && cl.leaves.items.length > 0,
        createAlumni: createAlumni && !cl.hasAlumniProfile,
      });
      await refreshPeople();
      const parts = [
        r.duesWaived ? `miễn ${r.duesWaived} khoản quỹ (${vnd(r.duesWaivedVnd)})` : "",
        r.dutyWeeksUpdated ? `gỡ khỏi ${r.dutyWeeksUpdated} tuần trực` : "",
        r.disciplineWaived ? `miễn ${r.disciplineWaived} hình phạt` : "",
        r.leavesRejected ? `đóng ${r.leavesRejected} đơn xin phép` : "",
        r.alumniCreated ? "tạo hồ sơ cựu thành viên" : "",
      ].filter(Boolean);
      showToast("success", `Đã chuyển ${memberName} sang "${status === "alumni" ? "Cựu thành viên" : "Đã rời lưu xá"}"${parts.length ? ` · ${parts.join(" · ")}` : ""}.`);
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
        <div role="dialog" aria-modal="true" aria-label={`Cho ${memberName} rời lưu xá`} className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0"><UserMinus className="w-5 h-5" /></span>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{status === "alumni" ? "Chuyển thành cựu thành viên" : "Cho rời lưu xá"} — {memberName}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Xem các việc còn treo của người này rồi chọn cách xử lý — làm một lần, hoặc không gì cả nếu có lỗi.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomSelect<"left" | "alumni">
                label="Chuyển sang"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "left", label: "Đã rời lưu xá", subLabel: "Khóa tài khoản, đăng xuất mọi thiết bị" },
                  { value: "alumni", label: "Cựu thành viên", subLabel: "Đã ra trường — tài khoản vẫn dùng được" },
                ]}
              />
              <CustomDatePicker label="Ngày rời (để trống = hôm nay)" format="YYYY-MM-DD" value={leftOn} onChange={setLeftOn} placeholder="Hôm nay" />
            </div>
            <CustomInput label="Lý do / ghi chú" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tốt nghiệp, chuyển nơi ở…" maxLength={500} />

            {error ? (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>
            ) : !cl ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-14 rounded-2xl" />)}</div>
            ) : (
              <>
                {cl.dues.items.length > 0 && (
                  <Block title={`Khoản quỹ chưa đóng — ${cl.dues.items.length} khoản, tổng ${vnd(cl.dues.totalVnd)}`}>
                    <ul className="text-xs text-gray-700 space-y-0.5 max-h-28 overflow-y-auto custom-scroll">
                      {cl.dues.items.map((d) => (
                        <li key={d.id} className="flex justify-between gap-2"><span className="truncate">{d.planName} · hạn {dmy(d.dueDate)}</span><b className="shrink-0">{vnd(d.remainingVnd)}</b></li>
                      ))}
                    </ul>
                    <CustomToggle checked={waiveDues} onChange={setWaiveDues} disabled={!cl.dues.canWaive} label="Miễn toàn bộ các khoản này" description={cl.dues.canWaive ? "Tắt = để nguyên, vẫn theo dõi khoản còn nợ ở Thu chi." : "Chỉ Trưởng nhà được miễn — bạn không có quyền này, các khoản sẽ được để nguyên."} />
                  </Block>
                )}
                {cl.dutyWeeks.items.length > 0 && (
                  <Block title={`Tuần trực vệ sinh sắp tới — ${cl.dutyWeeks.items.length} tuần`}>
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {cl.dutyWeeks.items.map((w) => (
                        <li key={w.id}>Tuần {dm(w.weekStart)} {w.partners.length ? `(trực cùng ${w.partners.join(", ")})` : "(chỉ có người này — tuần sẽ bị xóa)"}</li>
                      ))}
                    </ul>
                    <CustomToggle checked={removeDuty} onChange={setRemoveDuty} disabled={!cl.dutyWeeks.canEdit} label="Gỡ khỏi các tuần trực" description={cl.dutyWeeks.canEdit ? undefined : "Cần quyền quản lý lịch trực."} />
                  </Block>
                )}
                {cl.discipline.items.length > 0 && (
                  <Block title={`Hình phạt đang mở — ${cl.discipline.items.length}`}>
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {cl.discipline.items.map((d) => <li key={d.id}>{d.isRed ? "🔴 " : ""}{d.ruleTitle}</li>)}
                    </ul>
                    <CustomToggle checked={waiveDiscipline} onChange={setWaiveDiscipline} disabled={!cl.discipline.canManage} label="Đánh dấu miễn (ghi lý do: thành viên rời nhà)" />
                  </Block>
                )}
                {cl.leaves.items.length > 0 && (
                  <Block title={`Đơn xin phép đang chờ duyệt — ${cl.leaves.items.length}`}>
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {cl.leaves.items.map((l) => <li key={l.id}>{LEAVE_KIND_LABEL[l.kind]} · {dm(l.startsAt.slice(0, 10))} → {dm(l.endsAt.slice(0, 10))}</li>)}
                    </ul>
                    <CustomToggle checked={cancelLeaves} onChange={setCancelLeaves} disabled={!cl.leaves.canReview} label="Đóng các đơn này" description="Đơn được ghi “từ chối — thành viên đã rời nhà”." />
                  </Block>
                )}
                {!cl.dues.items.length && !cl.dutyWeeks.items.length && !cl.discipline.items.length && !cl.leaves.items.length && (
                  <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 font-semibold">Không còn việc nào treo — có thể chuyển trạng thái ngay.</p>
                )}
                {!cl.hasAlumniProfile && (
                  <CustomToggle checked={createAlumni} onChange={setCreateAlumni} label="Tạo hồ sơ cựu thành viên" description="Hồ sơ trống để bổ sung nghề nghiệp, nơi làm việc sau ở tab Cựu thành viên." />
                )}
              </>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="button" onClick={submit} disabled={busy || !cl} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm transition active:scale-95 disabled:opacity-60">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xác nhận
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
