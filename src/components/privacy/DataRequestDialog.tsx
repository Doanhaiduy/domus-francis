"use client";

import React, { useEffect, useState } from "react";
import { Info, Loader2, Send, ShieldQuestion } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { dataRequestsApi } from "@/lib/data/data-requests";
import {
  DATA_REQUEST_DUE_HOURS,
  DATA_REQUEST_FORM_TYPES,
  DATA_REQUEST_NEEDS_DETAILS,
  DATA_REQUEST_TYPE_HINT,
  DATA_REQUEST_TYPE_LABEL,
  type DataRequestType,
} from "@/lib/types/data-requests";
import { CustomTextarea } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { PrivacyDialog, dlgBtnGhost, dlgBtnPrimary } from "./PrivacyDialog";

/** Ghi chú riêng theo loại yêu cầu (để người gửi biết trước điều gì làm được / không). */
const TYPE_NOTE: Partial<Record<DataRequestType, string>> = {
  access: "Bạn có thể tự tải ngay bản sao dữ liệu của mình bằng nút “Tải dữ liệu của tôi”. Gửi yêu cầu khi cần thêm (vd. bản sao số CCCD đầy đủ, giải thích cách dữ liệu được dùng).",
  erasure:
    "Khi bạn còn ở nhà, dữ liệu cần cho sinh hoạt chung (phòng ở, trực, điểm danh, quỹ) chưa xóa được. Sau khi rời nhà, người quản lý ẩn danh hóa hồ sơ: xóa thông tin cá nhân, khóa tài khoản; sổ quỹ và chứng từ được giữ theo nghĩa vụ kế toán.",
  withdraw_consent: "Các đồng ý thông thường (hồ sơ Công giáo, chia sẻ điểm, gắn thẻ ảnh…) bạn tự tắt ngay ở Cài đặt → Bảo mật. Dùng mục này cho đồng ý bạn không tự tắt được.",
  rectification: "Phần lớn thông tin bạn tự sửa ở Hồ sơ cá nhân. Ghi rõ thông tin nào sai và giá trị đúng là gì.",
};

export function DataRequestDialog({ open, onClose, initialType = "access" }: { open: boolean; onClose: () => void; initialType?: DataRequestType }) {
  const { showToast } = useApp();
  const [type, setType] = useState<DataRequestType>(initialType);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(initialType);
      setDetails("");
      setError(null);
    }
  }, [open, initialType]);

  const needs = DATA_REQUEST_NEEDS_DETAILS.includes(type);
  const len = details.trim().length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needs && len < 10) return setError("Hãy mô tả cụ thể yêu cầu của bạn (tối thiểu 10 ký tự).");
    setBusy(true);
    try {
      const r = await dataRequestsApi.create({ type, details: details.trim() || null });
      const due = new Date(r.dueAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
      showToast("success", `Đã gửi yêu cầu. Người quản lý sẽ phản hồi trước ${due}; bạn sẽ nhận thông báo khi có trả lời.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrivacyDialog
      open={open}
      onClose={() => !busy && onClose()}
      icon={<ShieldQuestion className="w-5 h-5" />}
      title="Gửi yêu cầu về dữ liệu cá nhân"
      subtitle={`Người quản lý phản hồi trong ${DATA_REQUEST_DUE_HOURS} giờ`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={dlgBtnGhost}>
            Hủy
          </button>
          <button type="submit" form="data-request-form" disabled={busy} className={dlgBtnPrimary}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {busy ? "Đang gửi…" : "Gửi yêu cầu"}
          </button>
        </>
      }
    >
      <form id="data-request-form" onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-xs font-bold text-gray-700 mb-2">Bạn muốn yêu cầu điều gì?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Loại yêu cầu">
            {DATA_REQUEST_FORM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "text-left rounded-2xl border p-3 transition",
                  type === t ? "border-primary bg-purple-50 ring-2 ring-purple-200" : "border-gray-200 hover:border-purple-300 bg-white",
                )}
              >
                <span className="block text-xs font-extrabold text-gray-900">{DATA_REQUEST_TYPE_LABEL[t]}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{DATA_REQUEST_TYPE_HINT[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {TYPE_NOTE[type] && (
          <div className="flex gap-2.5 rounded-2xl border border-purple-100 bg-purple-50/60 p-3 text-[11px] text-gray-700 leading-relaxed">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
            <span>{TYPE_NOTE[type]}</span>
          </div>
        )}

        <CustomTextarea
          label={needs ? "Mô tả yêu cầu *" : "Mô tả thêm (không bắt buộc)"}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            type === "rectification"
              ? "VD: Ngày vào nhà của tôi là 09/2024, không phải 02/2025."
              : type === "objection"
                ? "VD: Tôi không muốn ảnh có tôi được đăng ở trang công khai."
                : "Ghi thêm điều bạn muốn người quản lý biết…"
          }
          hint={`${len}/2000 ký tự${needs ? " · tối thiểu 10 ký tự" : ""}`}
        />

        <p className="text-[11px] text-gray-500 leading-relaxed">
          Yêu cầu được ghi lại cùng thời điểm gửi; người quản lý (Trưởng nhà, Admin) có thể cần xác minh với bạn trước khi thực hiện (nhất là xóa dữ liệu) để
          tránh người khác mạo danh. Không mất phí. Nếu không thể thực hiện (vd. dữ liệu phải giữ theo luật hoặc sổ quỹ bất biến), người quản lý sẽ nêu rõ lý do.
        </p>

        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </form>
    </PrivacyDialog>
  );
}
