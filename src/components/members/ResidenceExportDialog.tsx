"use client";

// Xuất "Danh sách tạm trú" (khai báo tạm trú với công an): CCCD đầy đủ ⇒ BẮT BUỘC nhập lý do; mỗi CCCD được ghi vào nhật ký kiểm toán.
import React, { useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomInput } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { membersApi } from "@/lib/data/members";
import { exportResidenceList } from "@/lib/export/members-xlsx";

export default function ResidenceExportDialog({ onClose }: { onClose: () => void }) {
  const { showToast } = useApp();
  const [reason, setReason] = useState("Khai báo tạm trú với công an phường");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const dto = await membersApi.residenceExport(reason.trim());
      await exportResidenceList(dto);
      showToast("success", `Đã xuất ${dto.rows.length} thành viên${dto.missingNationalId ? ` (${dto.missingNationalId} người chưa có CCCD)` : ""}. Việc xem CCCD đã được ghi nhật ký kiểm toán.`);
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
        <div role="dialog" aria-modal="true" aria-label="Xuất danh sách tạm trú" className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><ShieldAlert className="w-5 h-5" /></span>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Xuất danh sách tạm trú</h3>
                <p className="text-xs text-gray-500 mt-0.5">Họ tên, ngày sinh, quê quán, địa chỉ thường trú, <b>số CCCD đầy đủ</b>, ngày vào ở, phòng của anh em đang ở.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
            Dữ liệu nhạy cảm: mỗi số CCCD được giải mã đều ghi vào nhật ký kiểm toán kèm lý do bên dưới. Tệp tải về chỉ dùng đúng mục đích và nên xóa sau khi dùng.
          </p>
          <CustomInput label="Lý do xuất *" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="VD: Khai báo tạm trú với công an phường" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl border text-xs font-bold">Hủy</button>
            <button type="button" onClick={run} disabled={busy || reason.trim().length < 5} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xuất Excel
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
