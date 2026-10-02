"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Plus,
  AlertTriangle,
  Calendar,
  Users,
  Bell,
  CheckCheck,
  ArrowRight,
  Clock,
  Pin,
  MapPin,
  Tag,
  Phone,
  Home,
  User,
  ShieldCheck,
  ArrowRightLeft,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { Portal } from "@/components/ui/Portal";
import {
  CustomInput,
  CustomSelect,
  CustomDatePicker,
  CustomTimePicker,
  CustomTextarea,
  ImageUploadDropzone,
} from "./ui/FormControls";

export const Modals: React.FC = () => {
  const {
    activeModal,
    closeModal,
    addExpense,
    addIssue,
    addAnnouncement,
    addThread,
    announcements,
    markAllAnnouncementsRead,
    markAnnouncementRead,
    events,
    addEvent,
    members,
    addMember,
    showToast,
  } = useApp();

  // Escape key listener to close active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    if (activeModal) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeModal, closeModal]);

  // State for Add Expense
  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("485000");
  const [expCategory, setExpCategory] = useState<string>("Thực phẩm");
  const [expNote, setExpNote] = useState("");
  const [expReceipt, setExpReceipt] = useState("");

  // State for Report Issue
  const [issueTitle, setIssueTitle] = useState("");
  const [issueLocation, setIssueLocation] = useState("Hành lang Tầng 2");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueUrgency, setIssueUrgency] = useState("Trung bình");
  const [issuePhoto, setIssuePhoto] = useState("");

  // State for Create Announcement
  const [annTitle, setAnnTitle] = useState("");
  const [annCategory, setAnnCategory] = useState<string>("Quan trọng");
  const [annContent, setAnnContent] = useState("");

  // State for Create Thread
  const [threadTitle, setThreadTitle] = useState("");
  const [threadCategory, setThreadCategory] = useState<string>("Đi chơi");
  const [threadContent, setThreadContent] = useState("");

  // State for Add Event
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("04/10/2026");
  const [eventTime, setEventTime] = useState("19:30 tối");
  const [eventLocation, setEventLocation] = useState("Phòng sinh hoạt chung T2");
  const [eventCategory, setEventCategory] = useState<string>("Họp nhà");
  const [eventOrganizer, setEventOrganizer] = useState("Trần Văn Đức (Trưởng nhà)");
  const [eventDesc, setEventDesc] = useState("");

  // State for Add Member
  const [memFullName, setMemFullName] = useState("");
  const [memRoom, setMemRoom] = useState("P.201");
  const [memPhone, setMemPhone] = useState("");
  const [memRole, setMemRole] = useState<any>("Thành viên");
  const [memAvatar, setMemAvatar] = useState("");

  if (!activeModal) return null;

  return (
    <Portal>
      <div
        onClick={closeModal}
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5 animate-in fade-in duration-150"
      >
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-auto"
          >
          {/* ========================================================================= */}
          {/* 1. NOTIFICATION CENTER MODAL                                              */}
          {/* ========================================================================= */}
          {activeModal === "notifications" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">Thông báo cộng đoàn</h3>
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-extrabold">
                        {announcements.filter((a) => a.isUnread).length} mới
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">Tin tức, hoạt động và thông tri nội bộ</p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Actions Bar */}
              <div className="py-2.5 px-6 flex items-center justify-between text-xs border-b border-gray-50 shrink-0 bg-gray-50/40">
                <button
                  onClick={markAllAnnouncementsRead}
                  className="inline-flex items-center gap-1.5 text-primary hover:text-primary-container font-semibold transition"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Đánh dấu tất cả đã đọc</span>
                </button>
                <Link
                  href="/thong-bao"
                  onClick={closeModal}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-primary font-semibold transition"
                >
                  <span>Xem trên Bảng tin</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Notification List (Scrollable) */}
              <div className="overflow-y-auto p-5 sm:p-6 space-y-2.5 flex-1 min-h-0">
                {announcements.map((ann) => (
                  <div
                    key={ann.id}
                    onClick={() => markAnnouncementRead(ann.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      ann.isUnread
                        ? "bg-purple-50/50 border-purple-200 shadow-2xs"
                        : "bg-surface-container-low/40 border-transparent hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            ann.category === "Quan trọng"
                              ? "bg-rose-100 text-rose-700"
                              : ann.category === "Sự kiện"
                              ? "bg-purple-100 text-primary"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {ann.category}
                        </span>
                        {ann.isPinned && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                            <Pin className="w-3 h-3 text-amber-600 fill-amber-500" /> Ghim
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">{ann.date}</span>
                    </div>

                    <h4 className="text-xs font-bold text-gray-900 mt-1.5 leading-snug">
                      {ann.title}
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {ann.preview}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-purple-100/40 text-[10px] text-gray-400">
                      <span>Đăng bởi: <b>{ann.author}</b> ({ann.authorRole})</span>
                      {ann.isUnread && (
                        <span className="text-primary font-bold">● Chưa đọc</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end bg-gray-50/70">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. MODAL GHI CHI TIÊU                                                     */}
          {/* ========================================================================= */}
          {activeModal === "addExpense" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Ghi Chi Tiêu Mới</h3>
                    <p className="text-xs text-gray-500">Khoản chi sẽ được thủ quỹ đối soát và xuất quỹ chung</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!expName) return;
                  addExpense({
                    name: expName,
                    amount: parseInt(expAmount) || 0,
                    category: expCategory as any,
                    paidBy: "Minh Tuấn",
                    note: expNote,
                    receiptUrl: expReceipt || undefined,
                  });
                  setExpName("");
                  setExpReceipt("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Tên khoản chi *"
                    required
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder="Ví dụ: Thịt cá chợ sáng, Bóng đèn, Nước lau sàn..."
                  />

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Số tiền thanh toán <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        value={expAmount}
                        onChange={(e) => setExpAmount(e.target.value)}
                        className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border-2 border-primary text-base font-extrabold text-gray-900 bg-purple-50/20 focus:outline-none"
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-gray-500">VNĐ</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Phân loại danh mục</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "Thực phẩm", label: "🛒 Bếp & Cơm" },
                        { key: "Điện nước", label: "⚡ Điện nước" },
                        { key: "Vệ sinh", label: "🧴 Vệ sinh" },
                        { key: "Sửa chữa", label: "🔧 Sửa chữa" },
                        { key: "Phụng vụ", label: "✝ Phụng vụ" },
                        { key: "Khác", label: "📦 Khác" },
                      ].map((cat) => (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setExpCategory(cat.key)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
                            expCategory === cat.key
                              ? "bg-primary text-white shadow-xs"
                              : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-100"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ImageUploadDropzone
                    label="Ảnh hóa đơn / Biên lai thanh toán (Tùy chọn)"
                    placeholder="Kéo thả ảnh biên lai hoặc nhấp để chọn tệp từ máy..."
                    helperText="Tải ảnh hóa đơn đỏ, biên nhận hoặc sao kê giao dịch (PNG, JPG)"
                    value={expReceipt}
                    onChange={setExpReceipt}
                  />

                  <CustomTextarea
                    label="Ghi chú thêm"
                    value={expNote}
                    onChange={(e) => setExpNote(e.target.value)}
                    placeholder="Mua tại đâu, chi tiết hóa đơn..."
                    rows={2}
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                  >
                    Xác nhận ghi chi
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. MODAL BÁO HỎNG THIẾT BỊ                                                */}
          {/* ========================================================================= */}
          {activeModal === "reportIssue" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Báo Hỏng Thiết Bị &amp; Cơ Sở</h3>
                    <p className="text-xs text-gray-500">Ban Hậu Cần sẽ tiếp nhận và tiến hành khảo sát sửa chữa</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!issueTitle) return;
                  addIssue({
                    title: issueTitle,
                    location: issueLocation,
                    reportedBy: "Minh Tuấn (P.204)",
                    description: issueDesc,
                    photoUrl: issuePhoto || undefined,
                  });
                  setIssueTitle("");
                  setIssueDesc("");
                  setIssuePhoto("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Tên sự cố thiết bị *"
                    required
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="Ví dụ: Vòi nước rỉ, Bóng đèn phòng cháy, Quạt trần kêu to..."
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <CustomSelect
                      label="Vị trí khu vực"
                      value={issueLocation}
                      onChange={setIssueLocation}
                      options={[
                        { value: "Hành lang Tầng 2", label: "Hành lang Tầng 2" },
                        { value: "Nhà vệ sinh Khu B", label: "Nhà vệ sinh Khu B" },
                        { value: "Bếp ăn chung", label: "Bếp ăn chung" },
                        { value: "Phòng sinh hoạt", label: "Phòng sinh hoạt" },
                        { value: "Nhà nguyện T3", label: "Nhà nguyện T3" },
                        { value: "Phòng ngủ cá nhân", label: "Phòng ngủ cá nhân" },
                      ]}
                    />

                    <CustomSelect
                      label="Mức độ khẩn cấp"
                      value={issueUrgency}
                      onChange={setIssueUrgency}
                      options={[
                        { value: "Trung bình", label: "Trung bình (48h)" },
                        { value: "Gấp", label: "Gấp (Trong ngày)" },
                        { value: "Khẩn cấp", label: "Khẩn cấp (Ngay)" },
                      ]}
                    />
                  </div>

                  <ImageUploadDropzone
                    label="Ảnh chụp hiện trạng sự cố (Tùy chọn)"
                    placeholder="Kéo thả ảnh hoặc nhấp để chọn tệp từ máy..."
                    helperText="Chụp vị trí hỏng để ban hậu cần chuẩn bị dụng cụ thay thế (PNG, JPG)"
                    value={issuePhoto}
                    onChange={setIssuePhoto}
                  />

                  <CustomTextarea
                    label="Mô tả hiện trạng"
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                    rows={3}
                    placeholder="Nêu rõ tình trạng hỏng hóc để anh em chuẩn bị sẵn dụng cụ thay thế..."
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md shadow-rose-200"
                  >
                    Gửi báo hỏng
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. MODAL THÊM SỰ KIỆN MỚI                                                  */}
          {/* ========================================================================= */}
          {activeModal === "addEvent" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Thêm Sự Kiện Sinh Hoạt</h3>
                    <p className="text-xs text-gray-500">Lên lịch hoạt động, thánh lễ hoặc họp nhà cho cộng đoàn</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!eventTitle) return;
                  addEvent({
                    title: eventTitle,
                    date: eventDate,
                    time: eventTime,
                    location: eventLocation,
                    category: eventCategory as any,
                    organizer: eventOrganizer,
                    description: eventDesc,
                  });
                  setEventTitle("");
                  setEventDesc("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Tên sự kiện / Hoạt động *"
                    required
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Ví dụ: Họp nhà tháng 10, Thánh lễ quan thầy, Dã ngoại..."
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <CustomDatePicker
                      label="Ngày diễn ra"
                      required
                      value={eventDate}
                      onChange={setEventDate}
                      placeholder="Chọn ngày..."
                    />

                    <CustomTimePicker
                      label="Giờ bắt đầu"
                      required
                      value={eventTime}
                      onChange={setEventTime}
                      placeholder="Chọn giờ..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CustomSelect
                      label="Phân loại sự kiện"
                      value={eventCategory}
                      onChange={setEventCategory}
                      options={[
                        { value: "Họp nhà", label: "Họp nhà", icon: "👥" },
                        { value: "Phụng vụ", label: "Phụng vụ", icon: "✝" },
                        { value: "Bổn mạng", label: "Lễ Bổn mạng", icon: "🎉" },
                        { value: "Dã ngoại", label: "Dã ngoại", icon: "🏖️" },
                        { value: "Sinh hoạt", label: "Sinh hoạt chung", icon: "🤝" },
                      ]}
                    />

                    <CustomInput
                      label="Địa điểm *"
                      required
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="Nguyện đường T3..."
                    />
                  </div>

                  <CustomInput
                    label="Người / Ban tổ chức"
                    value={eventOrganizer}
                    onChange={(e) => setEventOrganizer(e.target.value)}
                    placeholder="Ban Phụng vụ, Trưởng nhà..."
                  />

                  <CustomTextarea
                    label="Mô tả chi tiết"
                    value={eventDesc}
                    onChange={(e) => setEventDesc(e.target.value)}
                    rows={2}
                    placeholder="Kế hoạch, chuẩn bị cần thiết..."
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                  >
                    Thêm sự kiện
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. MODAL THÊM THÀNH VIÊN MỚI                                             */}
          {/* ========================================================================= */}
          {activeModal === "addMember" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Thêm Thành Viên Mới</h3>
                    <p className="text-xs text-gray-500">Cập nhật hồ sơ sinh viên vào danh bạ lưu xá</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!memFullName) return;
                  addMember({
                    name: memFullName.split(" ").slice(-1)[0] || memFullName,
                    fullName: memFullName,
                    room: memRoom,
                    phone: memPhone || "0900 000 000",
                    role: memRole,
                    avatarUrl: memAvatar || undefined,
                  });
                  setMemFullName("");
                  setMemPhone("");
                  setMemAvatar("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Họ và tên đầy đủ *"
                    required
                    value={memFullName}
                    onChange={(e) => setMemFullName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn Hoàng"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <CustomSelect
                      label="Phòng lưu trú"
                      value={memRoom}
                      onChange={setMemRoom}
                      options={[
                        { value: "P.101", label: "Phòng 101 (Tầng 1)" },
                        { value: "P.102", label: "Phòng 102 (Tầng 1)" },
                        { value: "P.103", label: "Phòng 103 (Tầng 1)" },
                        { value: "P.104", label: "Phòng 104 (Tầng 1)" },
                        { value: "P.105", label: "Phòng 105 (Tầng 1)" },
                        { value: "P.201", label: "Phòng 201 (Tầng 2)" },
                        { value: "P.202", label: "Phòng 202 (Tầng 2)" },
                        { value: "P.203", label: "Phòng 203 (Tầng 2)" },
                        { value: "P.204", label: "Phòng 204 (Tầng 2)" },
                        { value: "P.301", label: "Phòng 301 (Tầng 3)" },
                      ]}
                    />

                    <CustomSelect
                      label="Vai trò"
                      value={memRole}
                      onChange={setMemRole}
                      options={[
                        { value: "Thành viên", label: "Thành viên" },
                        { value: "Phó nhà", label: "Phó nhà" },
                        { value: "Thủ quỹ", label: "Thủ quỹ" },
                        { value: "Trưởng nhà", label: "Trưởng nhà" },
                      ]}
                    />
                  </div>

                  <CustomInput
                    label="Số điện thoại liên lạc *"
                    required
                    value={memPhone}
                    onChange={(e) => setMemPhone(e.target.value)}
                    placeholder="Ví dụ: 0912 345 678"
                  />

                  <ImageUploadDropzone
                    label="Ảnh đại diện / Avatar (Tùy chọn)"
                    placeholder="Kéo thả ảnh đại diện hoặc nhấp để chọn tệp từ máy..."
                    helperText="Tải ảnh chân dung rõ mặt (PNG, JPG, WEBP)"
                    value={memAvatar}
                    onChange={setMemAvatar}
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                  >
                    Thêm thành viên
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. MODAL TẠO THÔNG BÁO                                                    */}
          {/* ========================================================================= */}
          {activeModal === "createAnnouncement" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Đăng Thông Báo Mới</h3>
                  <p className="text-xs text-gray-500">Thông báo sẽ được gửi tới bảng tin toàn bộ thành viên</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!annTitle) return;
                  addAnnouncement({
                    title: annTitle,
                    preview: annContent.slice(0, 100) + "...",
                    content: annContent,
                    author: "Minh Tuấn",
                    authorRole: "Phó nhà",
                    category: annCategory as any,
                  });
                  setAnnTitle("");
                  setAnnContent("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Tiêu đề thông báo *"
                    required
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="Tiêu đề ngắn gọn, rõ ràng..."
                  />

                  <CustomSelect
                    label="Chuyên mục"
                    value={annCategory}
                    onChange={setAnnCategory}
                    options={[
                      { value: "Quan trọng", label: "Quan trọng", icon: "🚨" },
                      { value: "Sự kiện", label: "Sự kiện", icon: "🎉" },
                      { value: "Chung", label: "Chung", icon: "📢" },
                      { value: "Bếp & Cơm", label: "Bếp & Cơm", icon: "🍳" },
                    ]}
                  />

                  <CustomTextarea
                    label="Nội dung chi tiết *"
                    required
                    value={annContent}
                    onChange={(e) => setAnnContent(e.target.value)}
                    rows={4}
                    placeholder="Nội dung thông báo tới toàn thể anh em..."
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                  >
                    Đăng thông báo
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 7. MODAL TẠO CHỦ ĐỀ DIỄN ĐÀN                                              */}
          {/* ========================================================================= */}
          {activeModal === "createThread" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Tạo Chủ Đề Thảo Luận</h3>
                  <p className="text-xs text-gray-500">Giao lưu, góp ý hoặc chia sẻ ý tưởng mới cùng cả nhà</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!threadTitle) return;
                  addThread({
                    title: threadTitle,
                    content: threadContent,
                    author: "Minh Tuấn",
                    authorRole: "Phó nhà",
                    category: threadCategory as any,
                  });
                  setThreadTitle("");
                  setThreadContent("");
                  closeModal();
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomInput
                    label="Chủ đề thảo luận *"
                    required
                    value={threadTitle}
                    onChange={(e) => setThreadTitle(e.target.value)}
                    placeholder="Bạn muốn cùng thảo luận điều gì?"
                  />

                  <CustomSelect
                    label="Chuyên mục"
                    value={threadCategory}
                    onChange={setThreadCategory}
                    options={[
                      { value: "Đi chơi", label: "🏖️ Đi chơi & Dã ngoại" },
                      { value: "Bếp & Thực đơn", label: "🍳 Bếp & Thực đơn" },
                      { value: "Góp ý chung", label: "💡 Góp ý xây dựng" },
                      { value: "Học tập", label: "📚 Góc học tập" },
                      { value: "Giải trí", label: "🎉 Góc vui vẻ" },
                    ]}
                  />

                  <CustomTextarea
                    label="Nội dung *"
                    required
                    value={threadContent}
                    onChange={(e) => setThreadContent(e.target.value)}
                    rows={3}
                    placeholder="Mô tả ý tưởng của bạn..."
                  />
                </div>

                <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                  >
                    Tạo chủ đề
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 8. MODAL ĐỔI CA TRỰC                                                     */}
          {/* ========================================================================= */}
          {activeModal === "swapDuty" && (
            <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Yêu Cầu Đổi Ca Trực</h3>
                  <p className="text-xs text-gray-500">Ca hiện tại: Trực cửa &amp; Nấu cơm tối (Thứ Năm, 1/10)</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                <p className="text-xs text-gray-600">Chọn anh em bạn muốn nhờ đổi ca:</p>
                <div className="space-y-2">
                  {[
                    { name: "Đình Khôi (P.102)", note: "Rảnh tối T5" },
                    { name: "Văn Bình (P.103)", note: "Trực T6" },
                    { name: "Thanh Phong (P.105)", note: "Rảnh chiều tối" },
                  ].map((m, i) => (
                    <label key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:bg-purple-50/50 cursor-pointer transition">
                      <div className="flex items-center gap-2.5">
                        <input type="radio" name="swapMember" defaultChecked={i === 0} className="text-primary accent-primary" />
                        <span className="text-xs font-bold text-gray-900">{m.name}</span>
                      </div>
                      <span className="text-[11px] text-gray-400">{m.note}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={() => {
                    showToast("success", "Đã gửi tin nhắn xin đổi ca tới bạn!");
                    closeModal();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20"
                >
                  Gửi yêu cầu tới anh em
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </Portal>
);
};
