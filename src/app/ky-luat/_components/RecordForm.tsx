"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { vnToday } from "@/lib/vn-time";
import { disciplineApi, useDisciplineRules } from "@/lib/data/discipline";
import { PENALTY_KINDS, PENALTY_LABEL, PENALTY_UNIT, type DisciplineRecordDto, type PenaltyKind } from "@/lib/types/discipline";

const KIND_OPTIONS = PENALTY_KINDS.map((k) => ({ value: k, label: PENALTY_LABEL[k] }));
const OTHER_RULE = "";

/** Hộp thoại ghi nhận / sửa một vi phạm (Trưởng nhà, Admin). */
export function RecordForm({ record, defaultMemberId, onClose }: { record?: DisciplineRecordDto; defaultMemberId?: string; onClose: () => void }) {
  const { members, showToast } = useApp();
  const { rules } = useDisciplineRules();
  const editing = !!record;

  const [memberId, setMemberId] = useState(record?.memberId ?? defaultMemberId ?? "");
  const [ruleId, setRuleId] = useState(record?.ruleId ?? OTHER_RULE);
  const [ruleTitle, setRuleTitle] = useState(record && !record.ruleId ? record.ruleTitle : "");
  const [occurredOn, setOccurredOn] = useState(record?.occurredOn ?? vnToday());
  const [note, setNote] = useState(record?.note ?? "");
  const [kind, setKind] = useState<PenaltyKind>(record?.penaltyKind ?? "none");
  const [qty, setQty] = useState(record?.penaltyQty ? String(record.penaltyQty) : "");
  const [detail, setDetail] = useState(record?.penaltyDetail ?? "");
  const [startsOn, setStartsOn] = useState(record?.penaltyStartsOn ?? "");
  const [endsOn, setEndsOn] = useState(record?.penaltyEndsOn ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const memberOptions = useMemo(
    () =>
      members
        .filter((m) => m.status === "active" || m.status === "on_leave" || m.id === record?.memberId)
        .map((m) => ({ value: m.id, label: m.fullName, subLabel: m.room ?? undefined })),
    [members, record?.memberId]
  );
  const ruleOptions = useMemo(
    () => [
      ...rules.filter((r) => r.isActive || r.id === record?.ruleId).map((r) => ({
        value: r.id,
        label: `${r.code} — ${r.title}`,
        subLabel: [r.isRed ? "LỖI ĐỎ" : null, r.defaultPenaltyKind === "none" ? null : r.defaultPenaltyKind === "other" && r.defaultPenaltyNote ? r.defaultPenaltyNote : `${PENALTY_LABEL[r.defaultPenaltyKind]}${r.defaultPenaltyQty ? ` · ${r.defaultPenaltyQty} ${PENALTY_UNIT[r.defaultPenaltyKind]}` : ""}`].filter(Boolean).join(" · ") || undefined,
      })),
      { value: OTHER_RULE, label: "Khác (nhập tên điều vi phạm)" },
    ],
    [rules, record?.ruleId]
  );

  // Chọn điều luật ⇒ gợi ý hình phạt mặc định (chỉ khi thêm mới)
  const pickRule = (id: string) => {
    setRuleId(id);
    const r = rules.find((x) => x.id === id);
    if (r && !editing) {
      setKind(r.defaultPenaltyKind);
      setQty(r.defaultPenaltyQty ? String(r.defaultPenaltyQty) : "");
      setDetail(r.defaultPenaltyNote ?? "");
    }
  };

  const needsQty = kind === "rosary" || kind === "mass" || kind === "duty";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return showToast("error", "Hãy chọn thành viên.");
    if (!ruleId && ruleTitle.trim().length < 2) return showToast("error", "Chọn điều luật hoặc ghi tên điều đã vi phạm.");
    if (needsQty && !(Number(qty) >= 1)) return showToast("error", "Hãy nhập số lượng hình phạt (từ 1).");
    if (kind === "other" && detail.trim().length < 2) return showToast("error", "Hãy mô tả hình phạt khác.");
    if (startsOn && endsOn && endsOn < startsOn) return showToast("error", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
    const penalty = kind === "none"
      ? { penaltyKind: kind, penaltyQty: null, penaltyDetail: null, penaltyStartsOn: null, penaltyEndsOn: null }
      : { penaltyKind: kind, penaltyQty: needsQty ? Number(qty) : null, penaltyDetail: detail.trim() || null, penaltyStartsOn: startsOn || null, penaltyEndsOn: endsOn || null };
    setBusy(true);
    try {
      if (record) {
        await disciplineApi.updateRecord(record.id, { ruleId: ruleId || null, ruleTitle: ruleId ? null : ruleTitle.trim(), occurredOn, note: note.trim() || null, ...penalty });
        showToast("success", "Đã cập nhật ghi nhận.");
      } else {
        await disciplineApi.createRecord({ memberId, ruleId: ruleId || null, ruleTitle: ruleId ? null : ruleTitle.trim(), occurredOn, note: note.trim() || null, ...penalty });
        showToast("success", "Đã ghi nhận vi phạm và báo cho thành viên.");
      }
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editing ? "Sửa ghi nhận vi phạm" : "Ghi nhận vi phạm"} className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-gray-900">{editing ? "Sửa ghi nhận vi phạm" : "Ghi nhận vi phạm"}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Thành viên sẽ nhận thông báo và xem được mục này của chính mình.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4">
            <CustomSelect label="Thành viên" value={memberId} onChange={setMemberId} options={memberOptions} placeholder="Chọn thành viên…" disabled={editing} />
            <CustomSelect label="Điều luật vi phạm" value={ruleId} onChange={pickRule} options={ruleOptions} />
            {!ruleId && <CustomInput label="Tên điều đã vi phạm *" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} maxLength={200} placeholder="VD: Về nhà sau giờ giới nghiêm không xin phép" />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomDatePicker label="Ngày vi phạm" format="YYYY-MM-DD" value={occurredOn} onChange={(d) => d && setOccurredOn(d)} required />
            </div>
            <CustomTextarea label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Hoàn cảnh, lời giải thích của thành viên…" />

            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 space-y-3">
              <p className="text-xs font-extrabold text-gray-700">Hình phạt</p>
              <CustomSelect<PenaltyKind> label="Loại hình phạt" value={kind} onChange={setKind} options={KIND_OPTIONS} />
              {needsQty && <CustomInput label={`Số lượng (${PENALTY_UNIT[kind]}) *`} type="number" inputMode="numeric" min={1} max={365} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="VD: 5" />}
              {kind !== "none" && (
                <>
                  <CustomInput label={kind === "other" ? "Mô tả hình phạt *" : "Ghi chú hình phạt (tùy chọn)"} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} placeholder={kind === "other" ? "VD: Dọn nhà vệ sinh tầng 2 cả tuần" : kind === "rosary" ? "VD: lần chuỗi tối trước tượng Đức Mẹ" : "VD: đi lễ sáng"} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CustomDatePicker label="Bắt đầu chấp hành" format="YYYY-MM-DD" value={startsOn} onChange={setStartsOn} placeholder="Chưa đặt" />
                    <CustomDatePicker label="Kết thúc" format="YYYY-MM-DD" value={endsOn} onChange={setEndsOn} placeholder="Chưa đặt" />
                  </div>
                  <p className="text-[11px] text-gray-500">Có ngày bắt đầu/kết thúc thì hệ thống tự cho biết đang chấp hành, sắp tới hay quá hạn chưa xong.</p>
                </>
              )}
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {editing ? "Lưu thay đổi" : "Ghi nhận"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
