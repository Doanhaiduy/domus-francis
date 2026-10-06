"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  X,
  Copy,
  Download,
  CheckCircle2,
  Phone,
  Home,
  GraduationCap,
  Church,
  User,
  HeartHandshake,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import type { Member } from "@/lib/types/members";
import { useMemberDetail } from "@/lib/data/members";
import { useOrgSettings } from "@/lib/data/settings";
import { copyTextToClipboard, formatMemberCVForZalo } from "@/lib/zaloShare";
import { useApp } from "@/lib/store";
import { Portal } from "@/components/ui/Portal";
import { exportElementToPdf } from "@/lib/pdfExport";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api";
import type { MemberContributionRow } from "@/lib/types/finance";

interface MemberCVModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function MemberCVModal({
  member: baseMember,
  isOpen,
  onClose,
}: MemberCVModalProps) {
  const { showToast, members } = useApp();
  // Hồ sơ đầy đủ đọc từ máy chủ — trường nào người xem không có quyền (RLS) thì để trống
  const { member: detail } = useMemberDetail(isOpen ? baseMember?.id : null);
  // Tình trạng đóng quỹ thật (quỹ định kỳ + điện nước 12 tháng) — RLS: chính chủ hoặc người xem được quỹ cả nhà; không có quyền ⇒ "—"
  const { data: dues, error: duesError } = useSWR<MemberContributionRow[]>(
    isOpen && baseMember?.id ? `/api/v1/finance/members/${baseMember.id}/contributions?months=12` : null,
    swrFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
  const duesOwing = (dues ?? []).filter((c) => c.status === "unpaid" || c.status === "partial");
  const duesOwedVnd = duesOwing.reduce((s, c) => s + Math.max(0, c.amountDueVnd - c.amountPaidVnd), 0);
  const member: Member | null = detail ? { ...baseMember, ...detail } : baseMember;
  const houseHead = members.find((m) => m.role === "Trưởng nhà");
  const { org } = useOrgSettings();
  const today = new Date();
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !member) return null;

  const handleExportPdf = async () => {
    if (!printRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const success = await exportElementToPdf({
        element: printRef.current,
        filename: `So_Yeu_Ly_Lich_${member.fullName.replace(/\s+/g, "_")}`,
        margin: 8,
      });
      if (success) {
        showToast("success", `Đã tải PDF sơ yếu lý lịch ${member.fullName}!`);
      } else {
        showToast("error", "Không thể xuất PDF. Vui lòng thử lại!");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Đã xảy ra lỗi khi tạo file PDF. Vui lòng thử lại!");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyZalo = async () => {
    const text = formatMemberCVForZalo(member);
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", `Đã sao chép lý lịch ${member.fullName} vào bộ nhớ tạm! Có thể dán ngay vào Zalo.`);
    } else {
      showToast("error", "Không thể sao chép tự động. Vui lòng thử lại!");
    }
  };

  const handleDownloadTxt = () => {
    const text = formatMemberCVForZalo(member);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `So_Yeu_Ly_Lich_${member.fullName.replace(/\s+/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("success", "Đã tải file văn bản sơ yếu lý lịch thành công!");
  };

  return (
    <Portal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-5"
      >
        <div className="flex min-h-full items-center justify-center">
        {/* Container */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto"
        >
          {/* MODAL ACTION HEADER (Hidden in print) */}
          <div className="no-print shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-purple-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">
              📄
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Sơ Yếu Lý Lịch Sinh Viên Nội Trú
              </h3>
              <p className="text-xs text-gray-500">
                Mẫu chuẩn hành chính Lưu Xá Phanxicô · Hỗ trợ In A4 &amp; Xuất PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyZalo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition active:scale-95"
              title="Sao chép dạng text có icon để dán vào tin nhắn Zalo"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Zalo</span>
            </button>

            <button
              onClick={handleDownloadTxt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition active:scale-95"
              title="Tải văn bản .txt"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60 disabled:cursor-wait"
              title="Tải xuống file PDF"
            >
              {isExporting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang xuất...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải PDF (A4)</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE A4 CONTENT */}
        <div ref={printRef} className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 space-y-6 text-gray-800 printable-area font-serif bg-white">
          {/* HEADER FORM */}
          <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-gray-600">
                {(org.orderName || "Tỉnh Dòng Anh Em Hèn Mọn Việt Nam (OFM)").toUpperCase()}
              </p>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 uppercase">
                {(org.houseName || "Lưu Xá Sinh Viên Công Giáo Phanxicô Assisi").toUpperCase()}
              </h2>
              <p className="text-xs italic text-gray-600 mt-0.5">
                Châm ngôn: &ldquo;{org.motto || "Pax et Bonum — Bình An và Thiện Hảo"}&rdquo;
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Địa chỉ: {org.address || "—"}{org.contactPhone ? ` · Hotline: ${org.contactPhone}` : ""}
              </p>
            </div>

            {/* 3x4 PHOTO BOX */}
            <div className="w-24 h-32 border-2 border-dashed border-gray-400 rounded-md flex flex-col items-center justify-center bg-gray-50 shrink-0 text-center p-1">
              {member.avatarFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/v1/files/${member.avatarFileId}?v=medium`} alt="" className="w-full h-full object-cover rounded" />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center mb-1">
                    {member.avatarText}
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Ảnh 3×4</span>
                  <span className="text-[9px] text-gray-400">(Dán ảnh tại đây)</span>
                </>
              )}
            </div>
          </div>

          {/* MAIN TITLE */}
          <div className="text-center py-2">
            <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-gray-900 font-sans">
              SƠ YẾU LÝ LỊCH SINH VIÊN NỘI TRÚ
            </h1>
            <p className="text-xs italic text-gray-600 mt-1">
              (Hồ sơ quản lý nhân sự &amp; đăng ký tạm trú lưu xá · Niên khóa 2026 – 2027)
            </p>
          </div>

          {/* SECTION 1: PERSONAL & FAITH */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
              I. THÔNG TIN BẢN THÂN &amp; ĐỨC TIN
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Tên Thánh:</span>
                <span className="font-semibold text-primary">{member.holyName || "Chưa cập nhật"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Họ và tên khai sinh:</span>
                <span className="font-bold text-gray-900 uppercase">{member.fullName}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Ngày tháng năm sinh:</span>
                <span>{member.birthDate || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Giới tính:</span>
                <span>{member.gender || "Nam"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Số CCCD / Định danh:</span>
                <span className="font-mono">{member.identityCard || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Điện thoại cá nhân:</span>
                <span className="font-mono font-bold">{member.phone}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Giáo phận:</span>
                <span className="font-medium">{member.diocese || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Giáo xứ / Giáo họ:</span>
                <span className="font-medium">{member.parish || "---"}</span>
              </div>
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">Linh mục chính xứ:</span>
                <span>{member.pastor || "---"}</span>
              </div>
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">Các Bí tích đã lãnh:</span>
                <span>{member.sacraments?.length ? member.sacraments.join(" · ") : "---"}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: ACADEMIC */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
              II. QUÁ TRÌNH HỌC TẬP &amp; ĐÀO TẠO
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">Trường Đại học:</span>
                <span className="font-bold text-gray-900">{member.university || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Ngành / Chuyên ngành:</span>
                <span>{member.major || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Niên khóa:</span>
                <span>{member.academicYear || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Tình trạng:</span>
                <span className={member.studentStatus === "graduated" ? "font-bold text-purple-700" : "text-gray-900"}>
                  {member.studentStatus === "graduated"
                    ? "Đã tốt nghiệp (Ra trường)"
                    : member.studentStatus === "suspended"
                    ? "Bảo lưu"
                    : member.studentStatus === "dropped_out"
                    ? "Thôi học"
                    : "Đang học (Sinh viên)"}
                </span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Mã số sinh viên:</span>
                <span className="font-mono">{member.studentCode || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Quê quán:</span>
                <span>{member.hometown || "---"}</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: FAMILY & EMERGENCY CONTACT */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
              III. THÔNG TIN GIA ĐÌNH &amp; LIÊN HỆ KHẨN CẤP
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Họ tên Bố / Phụ huynh:</span>
                <span>{member.fatherName || "---"}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Họ tên Mẹ:</span>
                <span>{member.motherName || "---"}</span>
              </div>
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">SĐT Liên hệ khẩn cấp:</span>
                <span className="font-mono font-bold text-rose-700">{member.parentPhone || "---"}</span>
              </div>
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">Địa chỉ gia đình:</span>
                <span>{member.homeAddress || member.hometown || "---"}</span>
              </div>
            </div>
          </div>

          {/* SECTION 4: RESIDENCY & COMMUNITY DUTIES */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
              IV. SINH HOẠT TẠI LƯU XÁ PHANXICÔ
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Phòng ở hiện tại:</span>
                <span className="font-bold text-primary">{member.room}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Ngày nhập xá:</span>
                <span>{member.joined}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Chức vụ trong lưu xá:</span>
                <span className="font-semibold text-purple-900">{member.role}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Tình trạng đóng quỹ:</span>
                {duesError || !dues ? (
                  <span className="text-gray-400">---</span>
                ) : duesOwing.length === 0 ? (
                  <span className="text-emerald-700 font-bold">{dues.length ? "✓ Đã nộp đủ các khoản" : "Chưa có khoản phải thu"}</span>
                ) : (
                  <span className="text-rose-700 font-bold">
                    Còn nợ {duesOwedVnd.toLocaleString("vi-VN")}đ ({duesOwing.length} khoản)
                  </span>
                )}
              </div>
              <div className="flex">
                <span className="w-32 font-bold text-gray-700">Định mức quỹ kỳ:</span>
                <span className="font-semibold text-gray-900">
                  {member.customDuesVnd
                    ? `${member.customDuesVnd.toLocaleString("vi-VN")}đ (Định mức riêng)`
                    : member.effectiveDuesVnd
                    ? `${member.effectiveDuesVnd.toLocaleString("vi-VN")}đ (${member.studentStatus === "graduated" ? "Đã ra trường" : "Sinh viên"})`
                    : "---"}
                </span>
              </div>
              <div className="flex sm:col-span-2">
                <span className="w-32 font-bold text-gray-700 shrink-0">Ban &amp; Trách vụ:</span>
                <span>{member.duty || "Thành viên ban đời sống huynh đệ"}</span>
              </div>
            </div>
          </div>

          {/* SECTION 5: COMMITMENT & SIGNATURES */}
          <div className="pt-4 border-t border-gray-200 space-y-4">
            <p className="text-[11px] italic text-gray-600 leading-relaxed text-justify">
              <b>Lời cam kết của sinh viên:</b> Tôi xin cam kết những thông tin khai báo trên là hoàn toàn chính xác. 
              Trong suốt thời gian lưu trú tại Lưu Xá Sinh Viên Phanxicô Assisi, tôi cam kết tuyệt đối chấp hành 
              Nội quy Lưu xá, tích cực tham dự giờ kinh nguyện tối, lễ bổn mạng, các buổi sinh hoạt huynh đệ và 
              hoàn thành tốt các nhiệm vụ trực nhật, dọn dẹp khuôn viên chung.
            </p>

            <div className="grid grid-cols-3 gap-4 text-center text-xs pt-4 pb-8">
              <div>
                <p className="font-bold text-gray-700">SINH VIÊN NỘI TRÚ</p>
                <p className="text-[10px] italic text-gray-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
                <div className="h-16 flex items-end justify-center font-bold text-gray-900 font-sans">
                  {member.fullName}
                </div>
              </div>

              <div>
                <p className="font-bold text-gray-700">TRƯỞNG LƯU XÁ</p>
                <p className="text-[10px] italic text-gray-400 mt-0.5">(Xác nhận &amp; Duyệt phòng)</p>
                <div className="h-16 flex items-end justify-center font-bold text-gray-900 font-sans">
                  {houseHead?.fullName ?? ""}
                </div>
              </div>

              <div>
                <p className="font-bold text-gray-700">LINH HƯỚNG / ĐỒNG HÀNH</p>
                <p className="text-[10px] italic text-gray-400 mt-0.5">(Chứng nhận Tỉnh Dòng OFM)</p>
                <div className="h-16 flex items-end justify-center font-bold text-gray-900 font-sans">
                  {org.chaplainName || ""}
                </div>
              </div>
            </div>

            <div className="text-right text-[10px] text-gray-400 border-t border-gray-100 pt-2 font-sans">
              Hà Nội, ngày {String(today.getDate()).padStart(2, "0")} tháng {String(today.getMonth() + 1).padStart(2, "0")} năm {today.getFullYear()} · Mã hồ sơ: LX-PX-{String(member.memberNo ?? 0).padStart(4, "0")}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="no-print shrink-0 p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Hồ sơ đã được số hóa đồng bộ lên cơ sở dữ liệu lưu xá.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-100 transition"
            >
              Đóng
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl bg-primary text-white font-bold hover:bg-[#4d2dbf] shadow-md shadow-primary/20 transition flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
            >
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang xuất PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Tải PDF (A4)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</Portal>
);
}
