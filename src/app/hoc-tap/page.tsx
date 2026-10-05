"use client";

import React, { useMemo, useState } from "react";
import {
  GraduationCap,
  Award,
  TrendingUp,
  AlertTriangle,
  Search,
  Plus,
  Eye,
  Share2,
  Image as ImageIcon,
  Sparkles,
  HelpCircle,
  Table,
  LayoutGrid,
  Pencil,
  CheckCircle2,
  ShieldCheck,
  Lock,
  ClipboardCheck, Settings2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import Link from "next/link";
import AiAcademicInsight from "@/components/ai/AiAcademicInsight";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { academicApi, refreshAcademic, useAcademicMeta, useAcademicRecords } from "@/lib/data/academic";
import { RANK_ORDER, STATUS_META, computeStats, fmtGpa, formatAcademicZalo, rankBadge, semesterLabel } from "@/lib/academic-format";
import type { AcademicAction, AcademicRecordDto, AcademicStatus } from "@/lib/types/academic";
import HocTapLoading from "./loading";
import RecordFormModal from "./_components/RecordFormModal";
import RecordDetailModal from "./_components/RecordDetailModal";
import ReasonDialog from "./_components/ReasonDialog";

const official = (r: AcademicRecordDto) => r.status === "submitted" || r.status === "verified";
const initialOf = (r: AcademicRecordDto) => (r.displayName.split(/\s+/).pop() || r.memberName).charAt(0).toUpperCase();

export default function HocTapPage() {
  const { showToast, isLoadingSkeleton } = useApp();
  const { can, session } = useSession();
  const canWrite = can("academic.write_own") && !!session?.member;
  const leaderView = can(["academic.read_all", "academic.verify"]);

  const { records, error, isLoading } = useAcademicRecords();
  const { meta } = useAcademicMeta();

  // Bộ lọc
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [selectedRank, setSelectedRank] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicRecordDto | null>(null);
  const [busy, setBusy] = useState<AcademicAction | "delete" | null>(null);
  const [reasonFor, setReasonFor] = useState<{ record: AcademicRecordDto; action: "reject" | "reopen" } | null>(null);
  const [deleting, setDeleting] = useState<AcademicRecordDto | null>(null);

  const detail = detailId ? records.find((r) => r.id === detailId) ?? null : null;
  const ownRecords = useMemo(() => records.filter((r) => r.isOwn), [records]);

  const availableYears = useMemo(() => Array.from(new Set(records.map((r) => r.semester.yearCode))).sort().reverse(), [records]);

  const scopeRecords = useMemo(
    () =>
      records.filter(
        (r) => (selectedYear === "all" || r.semester.yearCode === selectedYear) && (selectedSemester === "all" || r.semester.name === selectedSemester)
      ),
    [records, selectedYear, selectedSemester]
  );

  const filteredRecords = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return scopeRecords.filter((rec) => {
      const matchRank = selectedRank === "all" || (selectedRank === "none" ? !rec.rank : rec.rank === selectedRank);
      const matchStatus = selectedStatus === "all" || rec.status === selectedStatus;
      const matchSearch =
        term === "" ||
        [rec.memberName, rec.university.name, rec.university.shortName ?? "", rec.major ?? "", rec.studentCode ?? "", rec.room]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchRank && matchStatus && matchSearch;
    });
  }, [scopeRecords, selectedRank, selectedStatus, searchTerm]);

  // Thống kê từ dữ liệu nhìn thấy được, theo phạm vi niên khóa/học kỳ đang chọn
  // Ban điều hành: chỉ tính bảng điểm đã nộp/xác minh (số liệu chính thức, không lẫn bản nháp của chính mình)
  const statsRecords = useMemo(() => (leaderView ? scopeRecords.filter(official) : scopeRecords), [scopeRecords, leaderView]);
  const stats = useMemo(() => computeStats(statsRecords), [statsRecords]);
  const pendingForMe = useMemo(() => records.filter((r) => r.can.verify), [records]);

  const scopeLabel = `${selectedYear === "all" ? "Tất cả năm học" : `Năm học ${selectedYear}`} • ${selectedSemester === "all" ? "Mọi học kỳ" : selectedSemester}`;

  const handleCopyZaloSummary = async () => {
    const text = formatAcademicZalo({ records: leaderView ? filteredRecords.filter(official) : filteredRecords, scopeLabel, personal: !leaderView });
    const success = await copyTextToClipboard(text);
    if (success) showToast("success", "Đã sao chép tổng hợp học lực! Có thể dán ngay vào Zalo Lưu Xá.");
    else showToast("error", "Không thể tự động sao chép. Vui lòng thử lại!");
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (r: AcademicRecordDto) => {
    setDetailId(null);
    setEditing(r);
    setFormOpen(true);
  };

  const runAction = async (r: AcademicRecordDto, action: AcademicAction, reason?: string) => {
    setBusy(action);
    try {
      const res = await academicApi.act(r.id, action, reason ?? null);
      const msg: Record<AcademicAction, string> = {
        submit: "Đã nộp bảng điểm — chờ Ban điều hành xác minh.",
        withdraw: "Đã rút bảng điểm về bản nháp — có thể chỉnh sửa.",
        verify: `Đã xác minh bảng điểm của ${r.memberName}.`,
        reject: `Đã trả lại bảng điểm cho ${r.memberName}.`,
        reopen: `Đã mở lại bảng điểm của ${r.memberName} về bản nháp.`,
      };
      showToast("success", msg[action]);
      if (!res.record) setDetailId(null);
      await refreshAcademic();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onAction = (r: AcademicRecordDto, action: AcademicAction) => {
    if (action === "reject" || action === "reopen") setReasonFor({ record: r, action });
    else void runAction(r, action);
  };

  const doDelete = async (r: AcademicRecordDto) => {
    setBusy("delete");
    try {
      await academicApi.remove(r.id);
      showToast("success", `Đã xóa bản nháp bảng điểm ${semesterLabel(r.semester)}.`);
      setDetailId(null);
      await refreshAcademic();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (isLoadingSkeleton || (isLoading && !records.length)) {
    return <HocTapLoading />;
  }

  const resetFilters = () => {
    setSelectedYear("all");
    setSelectedSemester("all");
    setSelectedRank("all");
    setSelectedStatus("all");
    setSearchTerm("");
  };

  const statusBadge = (s: AcademicStatus) => (
    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border inline-block whitespace-nowrap", STATUS_META[s].cls)}>{STATUS_META[s].label}</span>
  );

  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-200">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Quản Lý Học Tập &amp; Điểm Số</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">Học Vụ Lưu Xá</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Theo dõi kết quả học tập, điểm giữa kỳ - cuối kỳ, lưu trữ ảnh minh chứng bảng điểm (EVD) và đồng hành nguyện vọng
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyZaloSummary}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition active:scale-95"
          >
            <Share2 className="w-4 h-4 text-purple-600" />
            <span>Sao chép Zalo</span>
          </button>
          {can(["academic.scale.manage", "term.manage"]) && (
            <Link
              href="/cai-dat?tab=academic"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition"
              title="Thêm trường đại học, năm học, học kỳ"
            >
              <Settings2 className="w-4 h-4 text-gray-500" />
              <span>Trường & năm học</span>
            </Link>
          )}
          {canWrite && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Điền / Cập Nhật Điểm Số</span>
            </button>
          )}
        </div>
      </div>

      {/* AI nhận xét (tự ẩn khi tác vụ tắt/thiếu quyền; cá nhân cần đồng ý một lần) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 empty:hidden">
        {canWrite && <AiAcademicInsight scope="self" />}
        {can("academic.read_aggregate") && <AiAcademicInsight scope="house" />}
      </div>

      {/* 2. STATS KPI CARDS (tính từ bảng điểm bạn được xem, theo năm học/học kỳ đang lọc) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{leaderView ? "GPA Trung Bình" : "GPA Của Tôi"}</span>
            <div className="text-2xl font-black text-gray-900 mt-1">
              {stats.avgGpa4 !== null ? fmtGpa(stats.avgGpa4) : "—"} <span className="text-xs font-semibold text-gray-400">/ 4.0</span>
            </div>
            <span className="text-[10px] text-gray-400">{stats.avgGpa10 !== null ? `${fmtGpa(stats.avgGpa10)}/10 • ` : ""}{stats.ranked} bảng điểm {leaderView ? "đã nộp " : ""}có GPA</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Giỏi &amp; Xuất Sắc</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              {stats.excellentOrGood} <span className="text-xs font-semibold text-gray-400">/ {stats.ranked}</span>
            </div>
            <span className="text-[10px] text-gray-400">
              {RANK_ORDER.filter((k) => stats.byRank[k]).map((k) => `${k}: ${stats.byRank[k]}`).join(" • ") || "Chưa có xếp loại"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Đạt Học Bổng</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{stats.scholarship} SV</div>
            <span className="text-[10px] text-gray-400">trên {stats.students} sinh viên</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Cần Phụ Đạo / Kèm</span>
            <div className="text-2xl font-black text-rose-600 mt-1">{stats.needSupport} SV</div>
            <span className="text-[10px] text-gray-400">yêu cầu phụ đạo đang mở</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Hàng chờ xác minh (người có academic.verify) / phạm vi dữ liệu */}
      {pendingForMe.length > 0 ? (
        <div className="bg-amber-50/70 rounded-2xl px-4 py-3 border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <ClipboardCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Có <b>{pendingForMe.length}</b> bảng điểm đang chờ anh xác minh: {pendingForMe.slice(0, 3).map((r) => r.memberName).join(", ")}
              {pendingForMe.length > 3 ? "…" : ""}
            </span>
          </div>
          <button
            onClick={() => {
              resetFilters();
              setSelectedStatus("submitted");
            }}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition"
          >
            Xem danh sách chờ
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-gray-500 px-1 -mt-2">
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {leaderView
            ? "Ban điều hành chỉ xem bảng điểm đã nộp của anh em đồng ý chia sẻ kết quả học tập; số liệu trên tính từ các bảng điểm đó."
            : "Điểm số là dữ liệu riêng tư: bạn chỉ xem được bảng điểm của chính mình; Ban điều hành xem khi bạn đã nộp và đồng ý chia sẻ."}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-xs text-rose-700 font-semibold">Không tải được dữ liệu học tập: {errorMessage(error)}</div>
      )}

      {/* 3. FILTER & SEARCH TOOLBAR */}
      <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
            <span className="text-xs font-bold text-gray-400 mr-2 shrink-0">Niên khóa:</span>
            <button
              onClick={() => setSelectedYear("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                selectedYear === "all" ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
              )}
            >
              Tất cả các năm
            </button>
            {availableYears.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                  selectedYear === yr ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                Năm học {yr}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            <div className="w-40">
              <CustomSelect
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={[
                  { value: "all", label: "Mọi trạng thái" },
                  ...(Object.keys(STATUS_META) as AcademicStatus[]).map((k) => ({ value: k, label: STATUS_META[k].label })),
                ]}
              />
            </div>
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                viewMode === "table" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
              )}
              title="Chế độ bảng chi tiết"
            >
              <Table className="w-4 h-4" />
              <span className="hidden sm:inline">Bảng chi tiết</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                viewMode === "grid" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
              )}
              title="Chế độ thẻ sinh viên"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Dạng thẻ</span>
            </button>
          </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-400 mr-1">Xếp loại:</span>
            {["all", ...RANK_ORDER].map((rnk) => (
              <button
                key={rnk}
                onClick={() => setSelectedRank(rnk)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                  selectedRank === rnk ? "bg-purple-700 text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                {rnk === "all" ? "Tất cả xếp loại" : rnk}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-36">
              <CustomSelect
                value={selectedSemester}
                onChange={setSelectedSemester}
                options={[
                  { value: "all", label: "Tất cả học kỳ" },
                  { value: "Học kỳ 1", label: "Học kỳ 1" },
                  { value: "Học kỳ 2", label: "Học kỳ 2" },
                  { value: "Học kỳ hè", label: "Học kỳ hè" },
                ]}
              />
            </div>
            <div className="w-full sm:w-60">
              <CustomInput
                placeholder="Tìm tên, trường, ngành, MSSV..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. CONTENT LIST: TABLE OR CARDS */}
      {filteredRecords.length === 0 ? (
        <div className="py-16 bg-white rounded-3xl border border-dashed border-purple-200 text-center flex flex-col items-center justify-center p-6 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-xl">🎓</div>
          {records.length === 0 ? (
            <>
              <h3 className="text-base font-bold text-gray-900">{canWrite ? "Bạn chưa có bảng điểm nào" : "Chưa có bảng điểm nào để hiển thị"}</h3>
              <p className="text-xs text-gray-500 max-w-sm">
                {canWrite
                  ? "Nhập điểm quá trình/giữa kỳ, cuối kỳ của học kỳ này và tải ảnh minh chứng để Ban điều hành xác minh."
                  : "Bảng điểm chỉ hiển thị khi anh em đã nộp và đồng ý chia sẻ với Ban điều hành."}
              </p>
              {canWrite && (
                <button onClick={openCreate} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs">
                  Điền điểm số học kỳ này
                </button>
              )}
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900">Không tìm thấy hồ sơ học tập phù hợp</h3>
              <p className="text-xs text-gray-500 max-w-sm">Thử thay đổi bộ lọc học kỳ, xếp loại, trạng thái hoặc xóa từ khóa tìm kiếm để xem các hồ sơ khác.</p>
              <button onClick={resetFilters} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs">
                Xem tất cả sinh viên
              </button>
            </>
          )}
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
          {/* Điện thoại: mỗi bảng điểm một thẻ (bảng 8 cột bị bóp thành chữ dọc) — chạm để xem chi tiết môn học */}
          <div className="md:hidden flex flex-col gap-2 p-3">
            {filteredRecords.map((rec) => {
              const badge = rankBadge(rec.rank);
              return (
                <div key={rec.id} className="p-3 rounded-2xl border border-gray-100 bg-white flex flex-col gap-2">
                  <button type="button" onClick={() => setDetailId(rec.id)} className="text-left flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {initialOf(rec)}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-black text-gray-900 truncate">
                          {rec.memberName}
                          {rec.isOwn && <span className="ml-1 text-[9px] font-bold text-primary">(tôi)</span>}
                        </span>
                        <span className="block text-[11px] text-gray-500 truncate">
                          {rec.semester.name} · {rec.university.shortName ?? rec.university.name}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-sm font-black text-primary block leading-tight">{fmtGpa(rec.gpa4)}</span>
                      <span className="text-[10px] text-gray-400 font-mono">({fmtGpa(rec.gpa10)}/10)</span>
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", badge.bg, badge.text, badge.border)}>{rec.rank ?? "Chưa xếp loại"}</span>
                      {statusBadge(rec.status)}
                      {rec.hasScholarship && <span className="text-[10px] font-bold text-amber-600">⭐ Học bổng</span>}
                      {rec.support && <span className="text-[10px] font-bold text-rose-600">Cần phụ đạo: {rec.support.subject}</span>}
                    </div>
                    <div className="flex items-center shrink-0">
                      {rec.can.verify && (
                        <button
                          onClick={() => void runAction(rec, "verify")}
                          disabled={!!busy}
                          className="p-2 rounded-lg text-emerald-600 active:bg-emerald-50 disabled:opacity-50"
                          title="Xác minh bảng điểm"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {rec.can.edit && (
                        <button onClick={() => openEdit(rec)} className="p-2 rounded-lg text-gray-500 active:bg-purple-50" title="Sửa bảng điểm">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setDetailId(rec.id)} className="p-2 rounded-lg text-gray-500 active:bg-purple-50" title="Xem chi tiết">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto custom-scroll">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-low/60 border-b border-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                  <th className="py-3 px-4">Sinh Viên</th>
                  <th className="py-3 px-4">Trường &amp; Chuyên Ngành</th>
                  <th className="py-3 px-4">Kỳ Học</th>
                  <th className="py-3 px-4 text-center">GPA Hệ 4 / 10</th>
                  <th className="py-3 px-4 text-center">Xếp Loại</th>
                  <th className="py-3 px-4 text-center">Minh Chứng (EVD)</th>
                  <th className="py-3 px-4">Nguyện Vọng &amp; Kèm Cặp</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRecords.map((rec) => {
                  const badge = rankBadge(rec.rank);
                  return (
                    <tr key={rec.id} className="hover:bg-purple-50/20 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {initialOf(rec)}
                          </div>
                          <div>
                            <span className="block font-black text-gray-900">
                              {rec.memberName}
                              {rec.isOwn && <span className="ml-1 text-[9px] font-bold text-primary">(tôi)</span>}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {rec.room} • MSSV: {rec.studentCode ?? "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 block text-xs">{rec.university.name}</span>
                        <span className="text-[11px] text-gray-500">{rec.major ?? "—"}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 block">{rec.semester.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono block">{rec.semester.yearCode}</span>
                        <span className="mt-1 inline-block">{statusBadge(rec.status)}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono text-sm font-black text-primary block">{fmtGpa(rec.gpa4)}</span>
                        <span className="text-[10px] text-gray-400 font-mono">({fmtGpa(rec.gpa10)}/10)</span>
                        {rec.gpaPreview && rec.gpa4 !== null && <span className="block text-[9px] font-semibold text-gray-400">tạm tính</span>}
                        {rec.incompleteCount > 0 && <span className="block text-[9px] font-semibold text-amber-600">{rec.incompleteCount} môn chưa đủ điểm</span>}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-block", badge.bg, badge.text, badge.border)}>
                          {rec.rank ?? "Chưa xếp loại"}
                        </span>
                        {rec.hasScholarship && <span className="block text-[9px] font-bold text-amber-600 mt-1">⭐ Đạt học bổng</span>}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {rec.evidence ? (
                          <button
                            onClick={() => setDetailId(rec.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-bold border border-purple-200 transition active:scale-95"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>Xem minh chứng</span>
                          </button>
                        ) : (
                          <span className="text-gray-400 italic text-[10px]">Chưa nộp</span>
                        )}
                        {rec.status === "verified" && (
                          <span className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-emerald-600 mt-1">
                            <ShieldCheck className="w-3 h-3" />
                            {rec.verifiedByName ?? "Đã xác minh"}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                          {rec.goals?.goals || rec.goals?.difficulties || <span className="italic text-gray-400">—</span>}
                        </p>
                        {rec.support && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            Cần phụ đạo: {rec.support.subject}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {rec.can.verify && (
                          <button
                            onClick={() => void runAction(rec, "verify")}
                            disabled={!!busy}
                            className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50"
                            title="Xác minh bảng điểm"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {rec.can.edit && (
                          <button onClick={() => openEdit(rec)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition" title="Sửa bảng điểm">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDetailId(rec.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition"
                          title="Xem chi tiết môn học"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecords.map((rec) => {
            const badge = rankBadge(rec.rank);
            return (
              <div
                key={rec.id}
                className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border", badge.bg, badge.text, badge.border)}>
                        {rec.rank ?? "Chưa xếp loại"}
                      </span>
                      {statusBadge(rec.status)}
                    </div>
                    <span className="text-[11px] font-mono text-gray-400">
                      {rec.semester.name} • {rec.semester.yearCode}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {initialOf(rec)}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900 group-hover:text-primary transition-colors">{rec.memberName}</h3>
                      <p className="text-xs text-gray-500">
                        {rec.room} • MSSV: {rec.studentCode ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-surface-container-low/60 rounded-2xl border border-purple-50 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="text-gray-400">Trường:</span>
                      <span className="font-bold text-right truncate max-w-[180px]">{rec.university.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="text-gray-400">Ngành:</span>
                      <span className="font-semibold text-right truncate max-w-[180px]">{rec.major ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700 pt-1 border-t border-gray-100">
                      <span className="text-gray-400">Điểm GPA{rec.gpaPreview && rec.gpa4 !== null ? " (tạm tính)" : ""}:</span>
                      <span className="font-mono font-black text-primary text-sm">
                        {fmtGpa(rec.gpa4)} / 4.0 ({fmtGpa(rec.gpa10)}/10)
                      </span>
                    </div>
                  </div>

                  {(rec.goals?.goals || rec.goals?.difficulties) && (
                    <div className="text-xs text-gray-600 bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Nguyện vọng:</span>
                      <p className="line-clamp-2 leading-relaxed">{rec.goals?.goals || rec.goals?.difficulties}</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  {rec.support ? (
                    <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Cần phụ đạo
                    </span>
                  ) : rec.hasScholarship ? (
                    <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">⭐ Đạt học bổng</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">{rec.status === "verified" ? "Đã xác minh" : "Học lực ổn định"}</span>
                  )}

                  <button
                    onClick={() => setDetailId(rec.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold transition active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem bảng điểm &amp; EVD</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. MODAL: XEM BẢNG ĐIỂM & MINH CHỨNG */}
      <RecordDetailModal
        record={detail}
        busy={busy}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={(r) => setDeleting(r)}
        onAction={onAction}
      />

      {/* 6. MODAL: ĐIỀN / CẬP NHẬT ĐIỂM SỐ */}
      <RecordFormModal
        open={formOpen}
        meta={meta}
        ownRecords={ownRecords}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          void refreshAcademic();
        }}
      />

      <ReasonDialog
        open={!!reasonFor}
        title={reasonFor?.action === "reject" ? "Trả lại bảng điểm" : "Mở lại bảng điểm đã xác minh"}
        description={
          reasonFor?.action === "reject" ? (
            <>
              Bảng điểm của <b>{reasonFor?.record.memberName}</b> sẽ trở về trạng thái <b>Bị trả lại</b>; thành viên sửa rồi nộp lại.
            </>
          ) : (
            <>
              Bảng điểm của <b>{reasonFor?.record.memberName}</b> sẽ về <b>bản nháp</b> (bỏ dấu xác minh, GPA tạm thời không tính) để thành viên chỉnh sửa.
            </>
          )
        }
        placeholder={reasonFor?.action === "reject" ? "VD: Ảnh minh chứng bị mờ, chưa thấy điểm môn Giải tích 2…" : "VD: Bổ sung điểm môn còn thiếu theo phúc khảo…"}
        confirmText={reasonFor?.action === "reject" ? "Trả lại" : "Mở lại"}
        minLength={reasonFor?.action === "reject" ? 5 : 0}
        tone={reasonFor?.action === "reject" ? "danger" : "warning"}
        onClose={() => setReasonFor(null)}
        onConfirm={async (reason) => {
          if (!reasonFor) return;
          await runAction(reasonFor.record, reasonFor.action, reason || undefined);
          setReasonFor(null);
        }}
      />

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void doDelete(deleting)}
        title="Xóa bản nháp bảng điểm?"
        message={
          deleting ? (
            <>
              Bảng điểm <b>{semesterLabel(deleting.semester)}</b> ({deleting.subjects.length} môn) và ảnh minh chứng đính kèm sẽ bị gỡ. Thao tác không hoàn tác được.
            </>
          ) : (
            ""
          )
        }
        confirmText="Xóa bản nháp"
        variant="danger"
      />
    </div>
  );
}
