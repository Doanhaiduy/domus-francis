"use client";

import React, { useState } from "react";
import {
  Users,
  LayoutGrid,
  List,
  Phone,
  Home,
  Calendar,
  ShieldCheck,
  CheckCircle,
  Plus,
  FileDown,
  Copy,
  FileText,
  GraduationCap,
  HeartHandshake,
  Search,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { Member } from "@/lib/mockData";
import ThanhVienLoading from "./loading";
import MemberCVModal from "@/components/MemberCVModal";
import { formatMemberCVForZalo, copyTextToClipboard } from "@/lib/zaloShare";

export default function ThanhVienPage() {
  const { members, currentRole, setCurrentRole, showToast, openModal, isLoadingSkeleton } = useApp();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("1");
  const [roomFilter, setRoomFilter] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");

  // CV MODAL STATE
  const [isCvModalOpen, setIsCvModalOpen] = useState(false);
  const [cvMember, setCvMember] = useState<Member | null>(null);

  const handleOpenCV = (m: Member, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCvMember(m);
    setIsCvModalOpen(true);
  };

  const handleCopyZalo = async (m: Member, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const text = formatMemberCVForZalo(m);
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", `Đã sao chép lý lịch ${m.fullName}! Có thể dán ngay vào Zalo.`);
    } else {
      showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
    }
  };

  if (isLoadingSkeleton) {
    return <ThanhVienLoading />;
  }

  const filteredMembers = members
    .filter((m) => {
      if (roomFilter === "Tất cả") return true;
      if (roomFilter === "Tầng 1") return m.room.startsWith("P.1");
      if (roomFilter === "Tầng 2") return m.room.startsWith("P.2");
      if (roomFilter === "Tầng 3") return m.room.startsWith("P.3");
      return true;
    })
    .filter(
      (m) =>
        !searchQuery ||
        m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.room && m.room.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.phone && m.phone.includes(searchQuery))
    );

  const selectedMember = members.find((m) => m.id === selectedMemberId) || members[0];

  return (
    <div className="flex flex-col w-full gap-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              Thành Viên Lưu Xá
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
              12 Sinh Viên
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Danh bạ 12 anh em sinh viên Lưu Xá Phanxicô · Niên khóa 2026 – 2027
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* VIEW TOGGLE */}
          <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition ${
                viewMode === "grid" ? "bg-white shadow-2xs text-primary" : "text-gray-400"
              }`}
              title="Lưới thẻ"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition ${
                viewMode === "list" ? "bg-white shadow-2xs text-primary" : "text-gray-400"
              }`}
              title="Danh sách"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => openModal("addMember")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm thành viên</span>
          </button>
        </div>
      </div>

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Sĩ số hiện tại</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              12 <span className="text-sm font-semibold text-gray-400">thành viên</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-bold mt-1 inline-block">100% phòng kín (P.101 – P.301)</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold">
            🏠
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Ban Đại Diện</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              03 <span className="text-sm font-semibold text-gray-400">anh em</span>
            </div>
            <span className="text-[11px] text-purple-700 font-bold mt-1 inline-block">Trưởng nhà, Phó nhà &amp; Thủ quỹ</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">
            ⭐
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">
              Sinh nhật tháng {new Date().getMonth() + 1}
            </span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              {String(
                members.filter((m) => {
                  if (!m.birthDate) return false;
                  const parts = m.birthDate.split("/");
                  return parts.length >= 2 && parseInt(parts[1], 10) === new Date().getMonth() + 1;
                }).length
              ).padStart(2, "0")}{" "}
              <span className="text-sm font-semibold text-gray-400">anh em</span>
            </div>
            <span className="text-[11px] text-amber-700 font-bold mt-1 inline-block truncate max-w-[200px] sm:max-w-xs">
              {(() => {
                const curM = new Date().getMonth() + 1;
                const bList = members.filter((m) => {
                  if (!m.birthDate) return false;
                  const parts = m.birthDate.split("/");
                  return parts.length >= 2 && parseInt(parts[1], 10) === curM;
                });
                return bList.length > 0
                  ? bList.map((m) => {
                      const p = m.birthDate?.split("/") || [];
                      return `${m.fullName} (${p[0]}/${p[1]})`;
                    }).join(" · ")
                  : "Không có sinh nhật tháng này";
              })()}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            🎂
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên, phòng, SĐT..."
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["Tất cả", "Tầng 1", "Tầng 2", "Tầng 3"].map((flt) => (
            <button
              key={flt}
              onClick={() => setRoomFilter(flt)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0 ${
                roomFilter === flt
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
              }`}
            >
              {flt}
            </button>
          ))}
        </div>
      </div>

      {/* 2 COLUMNS: MEMBER CARDS & MEMBER DETAIL PANE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* MEMBERS GRID/LIST (8 COLS) */}
        <div className="lg:col-span-8">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredMembers.map((m) => {
                const isSelected = m.id === selectedMember?.id;

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMemberId(m.id)}
                    className={`p-4 rounded-3xl cursor-pointer transition border flex flex-col justify-between ${
                      isSelected
                        ? "bg-purple-50/80 border-primary shadow-xs"
                        : "bg-white hover:bg-surface-container-low border-purple-50 shadow-xs"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {m.room}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            m.role === "Trưởng nhà"
                              ? "bg-purple-100 text-purple-800"
                              : m.role === "Phó nhà"
                              ? "bg-indigo-100 text-indigo-800"
                              : m.role === "Thủ quỹ"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {m.role}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                          {m.avatarText}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-gray-900 truncate">{m.fullName}</h3>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{m.phone}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-purple-50/70 flex items-center justify-between text-[11px]">
                      <span className="text-gray-400">Vào: {m.joined}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => handleCopyZalo(m, e)}
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-primary transition"
                          title="Sao chép lý lịch gửi Zalo"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleOpenCV(m, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary font-bold text-[11px] transition"
                          title="Xem &amp; tải sơ yếu lý lịch (file PDF chuẩn A4)"
                        >
                          <FileDown className="w-3 h-3" />
                          <span>Tải lý lịch</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-4 border border-purple-50 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-bold">
                    <th className="pb-3 pl-2">Thành viên</th>
                    <th className="pb-3">Phòng</th>
                    <th className="pb-3">Số điện thoại</th>
                    <th className="pb-3">Vai trò</th>
                    <th className="pb-3">Vào nhà</th>
                    <th className="pb-3 text-right pr-2">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMemberId(m.id)}
                      className="hover:bg-purple-50/40 cursor-pointer"
                    >
                      <td className="py-3 pl-2">
                        <div className="font-bold text-gray-900">{m.fullName}</div>
                        {m.holyName && <div className="text-[10px] text-primary">{m.holyName}</div>}
                      </td>
                      <td className="py-3 text-gray-500">{m.room}</td>
                      <td className="py-3 text-gray-500 font-mono">{m.phone}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3 text-gray-400">{m.joined}</td>
                      <td className="py-3 text-right pr-2">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleCopyZalo(m, e)}
                            className="p-1.5 rounded-lg hover:bg-purple-100 text-gray-500 hover:text-primary transition"
                            title="Copy Zalo"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleOpenCV(m, e)}
                            className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary transition"
                            title="Xem &amp; Tải Sơ Yếu Lý Lịch (PDF)"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MEMBER DETAIL VIEW (4 COLS) */}
        {selectedMember && (
          <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col items-center text-center pb-4 border-b border-gray-100">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white font-extrabold text-xl flex items-center justify-center shadow-md shadow-purple-200 mb-3">
                {selectedMember.avatarText}
              </div>
              <h2 className="text-base font-bold text-gray-900">{selectedMember.fullName}</h2>
              {selectedMember.holyName && (
                <span className="text-xs font-semibold text-primary mt-0.5">
                  Tên Thánh: {selectedMember.holyName}
                </span>
              )}
              <span className="mt-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                {selectedMember.role}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                <span className="text-gray-400 flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> Phòng ở</span>
                <span className="font-bold text-gray-900">{selectedMember.room}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                <span className="text-gray-400 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Điện thoại</span>
                <span className="font-bold text-gray-900 font-mono">{selectedMember.phone}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                <span className="text-gray-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Gia nhập</span>
                <span className="font-bold text-gray-900">{selectedMember.joined}</span>
              </div>
              {selectedMember.hometown && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                  <span className="text-gray-400 flex items-center gap-1.5">🏡 Quê quán</span>
                  <span className="font-medium text-gray-800 text-right truncate max-w-[170px]">{selectedMember.hometown}</span>
                </div>
              )}
              {selectedMember.university && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                  <span className="text-gray-400 flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Đại học</span>
                  <span className="font-medium text-gray-800 text-right truncate max-w-[170px]">{selectedMember.university}</span>
                </div>
              )}
              {selectedMember.parentPhone && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70">
                  <span className="text-gray-400 flex items-center gap-1.5">🆘 SĐT Khẩn cấp</span>
                  <span className="font-mono font-bold text-rose-700">{selectedMember.parentPhone}</span>
                </div>
              )}
            </div>

            {/* CONTRIBUTION HISTORY */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                Lịch sử đóng quỹ 3 tháng gần nhất
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 text-emerald-900 font-medium">
                  <span>Tháng 10 / 2026</span>
                  <span className="font-bold">350.000đ ✓ Đã đóng</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 text-emerald-900 font-medium">
                  <span>Tháng 09 / 2026</span>
                  <span className="font-bold">350.000đ ✓ Đã đóng</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 text-emerald-900 font-medium">
                  <span>Tháng 08 / 2026</span>
                  <span className="font-bold">350.000đ ✓ Đã đóng</span>
                </div>
              </div>
            </div>

            {/* CV & EXPORT ACTIONS */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => handleOpenCV(selectedMember)}
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-primary/20 transition flex items-center justify-center gap-2 active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                <span>Xem &amp; Tải Sơ Yếu Lý Lịch (PDF)</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopyZalo(selectedMember)}
                  className="py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  <span>Copy Zalo</span>
                </button>
                <a
                  href={`tel:${selectedMember?.phone || ''}`}
                  className="py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-4 h-4" />
                  Gọi điện
                </a>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MEMBER CV MODAL */}
      <MemberCVModal
        member={cvMember}
        isOpen={isCvModalOpen}
        onClose={() => setIsCvModalOpen(false)}
      />

    </div>
  );
}
