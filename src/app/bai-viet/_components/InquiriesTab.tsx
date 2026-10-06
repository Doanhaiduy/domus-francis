"use client";

import React, { useMemo, useState } from "react";
import { Inbox, Mail, MapPin, Phone, School } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { inquiriesApi, useInquiries } from "@/lib/data/public-site";
import { INQUIRY_STATUS_LABEL, type InquiryDto, type InquiryStatus } from "@/lib/types/public-site";
import { CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<InquiryStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-sky-100 text-sky-800",
  visited: "bg-indigo-100 text-indigo-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  spam: "bg-gray-200 text-gray-600",
};
const STATUS_OPTIONS = (Object.keys(INQUIRY_STATUS_LABEL) as InquiryStatus[]).map((s) => ({ value: s, label: INQUIRY_STATUS_LABEL[s] }));
type Filter = "open" | "all" | InquiryStatus;

const fmt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

/** Hộp thư đăng ký tìm hiểu gửi từ trang /lien-he (người duyệt đơn xin vào nhà xử lý). */
export function InquiriesTab() {
  const { inquiries, isLoading } = useInquiries();
  const [filter, setFilter] = useState<Filter>("open");
  const shown = useMemo(
    () => inquiries.filter((i) => (filter === "all" ? true : filter === "open" ? i.status === "new" || i.status === "contacted" || i.status === "visited" : i.status === filter)),
    [inquiries, filter]
  );
  const newCount = inquiries.filter((i) => i.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-xl">Người ngoài để lại thông tin ở trang <b>Liên hệ</b>. Hãy liên hệ sớm và cập nhật trạng thái để cả nhóm cùng theo dõi.</p>
        <div className="w-48">
          <CustomSelect<Filter>
            value={filter}
            onChange={setFilter}
            options={[{ value: "open", label: `Đang xử lý${newCount ? ` (${newCount} mới)` : ""}` }, { value: "all", label: "Tất cả" }, ...STATUS_OPTIONS]}
          />
        </div>
      </div>

      {isLoading && !inquiries.length ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-28 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{inquiries.length ? "Không có đăng ký nào ở mục này" : "Chưa có đăng ký nào"}</p>
          {!inquiries.length && <p className="text-sm text-gray-500 mt-1">Khi có người điền biểu mẫu ở trang Liên hệ, thông tin sẽ hiện ở đây.</p>}
        </div>
      ) : (
        <ul className="space-y-3">{shown.map((i) => <InquiryCard key={i.id} item={i} />)}</ul>
      )}
    </div>
  );
}

function InquiryCard({ item }: { item: InquiryDto }) {
  const { showToast } = useApp();
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = (note.trim() || null) !== (item.note ?? null);

  const patch = async (b: { status?: InquiryStatus; note?: string | null }, ok: string) => {
    setBusy(true);
    try {
      await inquiriesApi.update(item.id, b);
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn("bg-white border rounded-2xl p-4 sm:p-5 space-y-3", item.status === "new" ? "border-amber-300 shadow-sm" : "border-purple-100", busy && "opacity-60 pointer-events-none")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-gray-900">{item.fullName}</h3>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", STATUS_STYLE[item.status])}>{INQUIRY_STATUS_LABEL[item.status]}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Gửi lúc {fmt(item.createdAt)}
            {item.handledByName && item.handledAt ? ` · ${item.handledByName} xử lý ${fmt(item.handledAt)}` : ""}
          </p>
        </div>
        <div className="w-44">
          <CustomSelect<InquiryStatus> value={item.status} onChange={(s) => patch({ status: s }, `Đã chuyển sang “${INQUIRY_STATUS_LABEL[s]}”.`)} options={STATUS_OPTIONS} />
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-700">
        {item.phone && <li className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /><a href={`tel:${item.phone}`} className="font-semibold hover:text-primary">{item.phone}</a></li>}
        {item.email && <li className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /><a href={`mailto:${item.email}`} className="font-semibold hover:text-primary">{item.email}</a></li>}
        {(item.school || item.yearOfStudy) && <li className="inline-flex items-center gap-1.5"><School className="w-3.5 h-3.5 text-gray-400" />{[item.school, item.yearOfStudy].filter(Boolean).join(" · ")}</li>}
        {item.parish && <li className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{item.parish}</li>}
      </ul>
      {item.preferredVisit && <p className="text-sm text-gray-700"><b>Muốn đến thăm:</b> {item.preferredVisit}</p>}
      {item.message && <p className="text-sm text-gray-700 bg-purple-50/60 rounded-xl p-3 whitespace-pre-line">{item.message}</p>}

      <div className="space-y-2">
        <CustomTextarea label="Ghi chú nội bộ" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="VD: Đã gọi 12/10, hẹn Chủ Nhật tới đến thăm." />
        {dirty && (
          <div className="flex justify-end">
            <button type="button" onClick={() => patch({ note: note.trim() || null }, "Đã lưu ghi chú.")} className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-container transition active:scale-95">Lưu ghi chú</button>
          </div>
        )}
      </div>
    </li>
  );
}
