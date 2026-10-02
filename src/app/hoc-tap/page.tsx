"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  GraduationCap,
  BookOpen,
  Award,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Plus,
  Eye,
  Share2,
  FileText,
  Image as ImageIcon,
  Sparkles,
  X,
  Check,
  Building,
  School,
  Maximize2,
  ChevronRight,
  HelpCircle,
  Table,
  LayoutGrid,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { AcademicRecord, SubjectScore } from "@/lib/mockData";
import { CustomInput, CustomSelect, CustomTextarea, SelectOption, ImageUploadDropzone } from "@/components/ui/FormControls";
import HocTapLoading from "./loading";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";

const RANK_BADGES: Record<
  AcademicRecord["rank"],
  { bg: string; text: string; border: string }
> = {
  "Xuất sắc": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
  "Giỏi": { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  "Khá": { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  "Trung bình": { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  "Cần cố gắng": { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
};

export default function HocTapPage() {
  const {
    academicRecords,
    addAcademicRecord,
    updateAcademicRecord,
    deleteAcademicRecord,
    members,
    showToast,
    isLoadingSkeleton,
    currentRole,
  } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter States
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [selectedRank, setSelectedRank] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Evidence (EVD) Lightbox Modal State
  const [activeEvdRecord, setActiveEvdRecord] = useState<AcademicRecord | null>(null);

  // Add / Edit Record Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const [formUniversity, setFormUniversity] = useState("ĐH Bách Khoa TP.HCM");
  const [formMajor, setFormMajor] = useState("Kỹ thuật Cơ điện tử");
  const [formStudentId, setFormStudentId] = useState("2310123");
  const [formAcademicYear, setFormAcademicYear] = useState("2025-2026");
  const [formSemester, setFormSemester] = useState<AcademicRecord["semester"]>("Học kỳ 2");
  const [formAspirations, setFormAspirations] = useState("");
  const [formEvidencePhoto, setFormEvidencePhoto] = useState(
    "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=1200&q=80"
  );
  const [formSupportNeeded, setFormSupportNeeded] = useState(false);
  const [formSupportSubject, setFormSupportSubject] = useState("");
  const [formScholarship, setFormScholarship] = useState(true);

  // Dynamic Subjects List in Add Form
  const [formSubjects, setFormSubjects] = useState<
    Array<{ subjectName: string; credits: number; midtermScore: number; finalScore: number }>
  >([
    { subjectName: "Toán chuyên đề", credits: 3, midtermScore: 8.5, finalScore: 9.0 },
    { subjectName: "Lập trình ứng dụng", credits: 3, midtermScore: 8.0, finalScore: 8.5 },
  ]);

  // Available Years
  const availableYears = useMemo(() => {
    const set = new Set(academicRecords.map((r) => r.academicYear));
    return Array.from(set).sort().reverse();
  }, [academicRecords]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return academicRecords.filter((rec) => {
      const matchYear = selectedYear === "all" || rec.academicYear === selectedYear;
      const matchSem = selectedSemester === "all" || rec.semester === selectedSemester;
      const matchRank = selectedRank === "all" || rec.rank === selectedRank;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        term === "" ||
        rec.memberName.toLowerCase().includes(term) ||
        rec.university.toLowerCase().includes(term) ||
        rec.major.toLowerCase().includes(term) ||
        rec.studentId.toLowerCase().includes(term) ||
        rec.room.toLowerCase().includes(term);

      return matchYear && matchSem && matchRank && matchSearch;
    });
  }, [academicRecords, selectedYear, selectedSemester, selectedRank, searchTerm]);

  // Statistics
  const totalStudents = academicRecords.length;
  const avgGpa4 = useMemo(() => {
    if (academicRecords.length === 0) return 0;
    const sum = academicRecords.reduce((s, r) => s + r.gpa4, 0);
    return (sum / academicRecords.length).toFixed(2);
  }, [academicRecords]);

  const excellentCount = useMemo(() => {
    return academicRecords.filter((r) => r.rank === "Xuất sắc" || r.rank === "Giỏi").length;
  }, [academicRecords]);

  const scholarshipCount = useMemo(() => {
    return academicRecords.filter((r) => r.scholarshipEligible).length;
  }, [academicRecords]);

  const needSupportCount = useMemo(() => {
    return academicRecords.filter((r) => r.supportNeeded).length;
  }, [academicRecords]);

  // Handle Add Subject Row in Form
  const handleAddSubjectRow = () => {
    setFormSubjects((prev) => [
      ...prev,
      { subjectName: "", credits: 3, midtermScore: 7.0, finalScore: 7.0 },
    ]);
  };

  const handleRemoveSubjectRow = (index: number) => {
    setFormSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  // Helper to calculate Letter Grade & GPA
  const computeSubjectTotal = (mid: number, fin: number) => {
    return Math.round((mid * 0.4 + fin * 0.6) * 10) / 10;
  };

  const computeLetterGrade = (total: number) => {
    if (total >= 9.0) return "A+";
    if (total >= 8.5) return "A";
    if (total >= 8.0) return "B+";
    if (total >= 7.0) return "B";
    if (total >= 6.5) return "C+";
    if (total >= 5.5) return "C";
    if (total >= 4.0) return "D";
    return "F";
  };

  // Handle Submit New Academic Record
  const handleCreateRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberName) {
      showToast("error", "Vui lòng chọn thành viên!");
      return;
    }
    const memberObj = members.find((m) => m.fullName === selectedMemberName);
    const room = memberObj?.room || "Lưu Xá";

    const subjects: SubjectScore[] = formSubjects
      .filter((s) => s.subjectName.trim().length > 0)
      .map((s, idx) => {
        const total = computeSubjectTotal(s.midtermScore, s.finalScore);
        return {
          id: `sub-${Date.now()}-${idx}`,
          subjectName: s.subjectName.trim(),
          credits: Number(s.credits) || 3,
          midtermScore: Number(s.midtermScore),
          finalScore: Number(s.finalScore),
          totalScore: total,
          letterGrade: computeLetterGrade(total),
        };
      });

    if (subjects.length === 0) {
      showToast("error", "Vui lòng nhập ít nhất 1 môn học!");
      return;
    }

    // Calculate overall GPA
    const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);
    const weighted10 = subjects.reduce((sum, s) => sum + s.totalScore * s.credits, 0);
    const gpa10 = Math.round((weighted10 / totalCredits) * 100) / 100;
    const gpa4 = Math.round(((gpa10 / 10) * 4) * 100) / 100;

    let rank: AcademicRecord["rank"] = "Khá";
    if (gpa4 >= 3.6) rank = "Xuất sắc";
    else if (gpa4 >= 3.2) rank = "Giỏi";
    else if (gpa4 >= 2.5) rank = "Khá";
    else if (gpa4 >= 2.0) rank = "Trung bình";
    else rank = "Cần cố gắng";

    addAcademicRecord({
      memberId: memberObj?.id || `m-${Date.now()}`,
      memberName: selectedMemberName,
      room,
      university: formUniversity.trim(),
      major: formMajor.trim(),
      studentId: formStudentId.trim() || "2310000",
      academicYear: formAcademicYear,
      semester: formSemester,
      gpa10,
      gpa4,
      rank,
      subjects,
      evidencePhoto: formEvidencePhoto,
      aspirations: formAspirations.trim() || "Tiếp tục nỗ lực duy trì học lực tốt trong năm học.",
      scholarshipEligible: formScholarship,
      supportNeeded: formSupportNeeded,
      supportSubject: formSupportNeeded ? formSupportSubject.trim() : undefined,
    });

    setIsAddModalOpen(false);
    // Reset Form
    setSelectedMemberName("");
    setFormAspirations("");
  };

  // Copy Academic Summary to Zalo
  const handleCopyZaloSummary = async () => {
    let text = `🎓 BÁO CÁO HỌC LỰC & ĐIỂM SỐ LƯU XÁ PHANXICÔ\n`;
    text += `Niên khóa: ${selectedYear === "all" ? "Tổng thể" : selectedYear} • Học kỳ: ${selectedSemester === "all" ? "Cả năm" : selectedSemester}\n\n`;
    text += `📊 Thống kê chung:\n`;
    text += `• Điểm GPA trung bình: ${avgGpa4} / 4.0\n`;
    text += `• Số sinh viên Giỏi & Xuất sắc: ${excellentCount}/${totalStudents}\n`;
    text += `• Sinh viên đạt học bổng: ${scholarshipCount} anh em\n`;
    text += `• Sinh viên cần hỗ trợ phụ đạo: ${needSupportCount} anh em\n\n`;
    text += `🏆 Danh sách tiêu biểu:\n`;

    filteredRecords.slice(0, 5).forEach((r, idx) => {
      text += `${idx + 1}. ${r.memberName} (${r.room} - ${r.university}): GPA ${r.gpa4}/4.0 (${r.rank})\n`;
    });

    text += `\nPax et Bonum - Ban Học Tập Lưu Xá Sinh Viên Phanxicô`;
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast("success", "Đã sao chép tổng hợp học lực! Có thể dán ngay vào Zalo Lưu Xá.");
    }
  };

  if (isLoadingSkeleton) {
    return <HocTapLoading />;
  }

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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Quản Lý Học Tập &amp; Điểm Số
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold font-mono">
                  Học Vụ Lưu Xá
                </span>
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
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Điền / Cập Nhật Điểm Số</span>
          </button>
        </div>
      </div>

      {/* 2. STATS KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              GPA Trung Bình
            </span>
            <div className="text-2xl font-black text-gray-900 mt-1">
              {avgGpa4} <span className="text-xs font-semibold text-gray-400">/ 4.0</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Giỏi &amp; Xuất Sắc
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              {excellentCount} <span className="text-xs font-semibold text-gray-400">/ {totalStudents}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Đạt Học Bổng
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1">{scholarshipCount} SV</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Cần Phụ Đạo / Kèm
            </span>
            <div className="text-2xl font-black text-rose-600 mt-1">{needSupportCount} SV</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. FILTER & SEARCH TOOLBAR */}
      <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
            <span className="text-xs font-bold text-gray-400 mr-2 shrink-0">Niên khóa:</span>
            <button
              onClick={() => setSelectedYear("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0",
                selectedYear === "all"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
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
                  selectedYear === yr
                    ? "bg-primary text-white shadow-xs"
                    : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                Năm học {yr}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl shrink-0 self-end sm:self-auto">
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

        {/* Filters & Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-400 mr-1">Xếp loại:</span>
            {["all", "Xuất sắc", "Giỏi", "Khá", "Trung bình", "Cần cố gắng"].map((rnk) => (
              <button
                key={rnk}
                onClick={() => setSelectedRank(rnk)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                  selectedRank === rnk
                    ? "bg-purple-700 text-white shadow-xs"
                    : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                {rnk === "all" ? "Tất cả xếp loại" : rnk}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
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

            <div className="w-60">
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
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold text-xl">
            🎓
          </div>
          <h3 className="text-base font-bold text-gray-900">
            Không tìm thấy hồ sơ học tập phù hợp
          </h3>
          <p className="text-xs text-gray-500 max-w-sm">
            Thử thay đổi bộ lọc học kỳ, xếp loại hoặc xóa từ khóa tìm kiếm để xem các hồ sơ khác.
          </p>
          <button
            onClick={() => {
              setSelectedYear("all");
              setSelectedSemester("all");
              setSelectedRank("all");
              setSearchTerm("");
            }}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-[#4d2dbf] transition shadow-xs"
          >
            Xem tất cả sinh viên
          </button>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
          <div className="overflow-x-auto custom-scroll">
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
                  const badge = RANK_BADGES[rec.rank];

                  return (
                    <tr key={rec.id} className="hover:bg-purple-50/20 transition-colors">
                      {/* Member & Room */}
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {rec.memberName.charAt(0)}
                          </div>
                          <div>
                            <span className="block font-black text-gray-900">{rec.memberName}</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {rec.room} • MSSV: {rec.studentId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* University & Major */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 block text-xs">{rec.university}</span>
                        <span className="text-[11px] text-gray-500">{rec.major}</span>
                      </td>

                      {/* Semester */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 block">{rec.semester}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{rec.academicYear}</span>
                      </td>

                      {/* GPA */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono text-sm font-black text-primary block">
                          {rec.gpa4.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          ({rec.gpa10.toFixed(2)}/10)
                        </span>
                      </td>

                      {/* Rank & Scholarship */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-block",
                            badge.bg,
                            badge.text,
                            badge.border
                          )}
                        >
                          {rec.rank}
                        </span>
                        {rec.scholarshipEligible && (
                          <span className="block text-[9px] font-bold text-amber-600 mt-1">
                            ⭐ Đạt học bổng
                          </span>
                        )}
                      </td>

                      {/* EVD Button */}
                      <td className="py-3.5 px-4 text-center">
                        {rec.evidencePhoto ? (
                          <button
                            onClick={() => setActiveEvdRecord(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-bold border border-purple-200 transition active:scale-95"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>Xem EVD</span>
                          </button>
                        ) : (
                          <span className="text-gray-400 italic text-[10px]">Chưa nộp</span>
                        )}
                      </td>

                      {/* Aspirations */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                          {rec.aspirations}
                        </p>
                        {rec.supportNeeded && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            Cần phụ đạo: {rec.supportSubject}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setActiveEvdRecord(rec)}
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
            const badge = RANK_BADGES[rec.rank];

            return (
              <div
                key={rec.id}
                className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                        badge.bg,
                        badge.text,
                        badge.border
                      )}
                    >
                      {rec.rank}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      {rec.semester} • {rec.academicYear}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {rec.memberName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900 group-hover:text-primary transition-colors">
                        {rec.memberName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {rec.room} • MSSV: {rec.studentId}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-surface-container-low/60 rounded-2xl border border-purple-50 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="text-gray-400">Trường:</span>
                      <span className="font-bold text-right truncate max-w-[180px]">{rec.university}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700">
                      <span className="text-gray-400">Ngành:</span>
                      <span className="font-semibold text-right">{rec.major}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700 pt-1 border-t border-gray-100">
                      <span className="text-gray-400">Điểm GPA:</span>
                      <span className="font-mono font-black text-primary text-sm">
                        {rec.gpa4.toFixed(2)} / 4.0 ({rec.gpa10.toFixed(2)}/10)
                      </span>
                    </div>
                  </div>

                  {rec.aspirations && (
                    <div className="text-xs text-gray-600 bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                        Nguyện vọng:
                      </span>
                      <p className="line-clamp-2 leading-relaxed">{rec.aspirations}</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  {rec.supportNeeded ? (
                    <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Cần phụ đạo
                    </span>
                  ) : rec.scholarshipEligible ? (
                    <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                      ⭐ Đạt học bổng
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">Học lực ổn định</span>
                  )}

                  <button
                    onClick={() => setActiveEvdRecord(rec)}
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

      {/* ======================================================== */}
      {/* 5. MODAL: XEM MINH CHỨNG BẢNG ĐIỂM (EVD LIGHTBOX) */}
      {/* ======================================================== */}
      {activeEvdRecord &&
        mounted &&
        createPortal(
          <div
            onClick={() => setActiveEvdRecord(null)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
              >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900">
                        Minh Chứng Bảng Điểm (EVD): {activeEvdRecord.memberName}
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {activeEvdRecord.university} • {activeEvdRecord.semester} ({activeEvdRecord.academicYear})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveEvdRecord(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto custom-scroll space-y-4 flex-1">
                  {/* Photo Preview */}
                  {activeEvdRecord.evidencePhoto ? (
                    <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm relative group bg-gray-950">
                      <img
                        src={activeEvdRecord.evidencePhoto}
                        alt="EVD Minh Chứng"
                        className="w-full max-h-72 object-contain mx-auto"
                      />
                      <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold">
                        Ảnh chụp cổng thông tin sinh viên
                      </span>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                      Sinh viên chưa tải ảnh minh chứng bảng điểm.
                    </div>
                  )}

                  {/* Subject score breakdown table */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Chi tiết điểm từng môn học ({activeEvdRecord.subjects.length} môn):
                    </h4>
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase font-bold">
                          <tr>
                            <th className="py-2 px-3">Tên môn học</th>
                            <th className="py-2 px-3 text-center">Tín chỉ</th>
                            <th className="py-2 px-3 text-center">Giữa kỳ</th>
                            <th className="py-2 px-3 text-center">Cuối kỳ</th>
                            <th className="py-2 px-3 text-center">Tổng kết</th>
                            <th className="py-2 px-3 text-center">Điểm chữ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {activeEvdRecord.subjects.map((sub) => (
                            <tr key={sub.id} className="hover:bg-purple-50/20">
                              <td className="py-2 px-3 font-bold text-gray-900">{sub.subjectName}</td>
                              <td className="py-2 px-3 text-center font-mono">{sub.credits}</td>
                              <td className="py-2 px-3 text-center font-mono text-purple-700 font-bold">{sub.midtermScore}</td>
                              <td className="py-2 px-3 text-center font-mono text-indigo-700 font-bold">{sub.finalScore}</td>
                              <td className="py-2 px-3 text-center font-mono font-black text-gray-900">{sub.totalScore}</td>
                              <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">{sub.letterGrade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Aspirations & Notes */}
                  <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1">
                    <span className="text-xs font-bold text-purple-900 block">
                      Nguyện vọng &amp; Ghi chú học tập:
                    </span>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {activeEvdRecord.aspirations}
                    </p>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2.5 bg-gray-50/50">
                  <button
                    onClick={() => setActiveEvdRecord(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ======================================================== */}
      {/* 6. MODAL: ĐIỀN / CẬP NHẬT ĐIỂM SỐ */}
      {/* ======================================================== */}
      {isAddModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsAddModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
              >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="text-base font-black text-gray-900">Điền Kết Quả Điểm Số Sinh Viên</h3>
                      <p className="text-[11px] text-gray-500">Cập nhật điểm giữa kỳ, cuối kỳ và ảnh minh chứng EVD</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateRecordSubmit} className="p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
                  {/* Member selection */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Chọn thành viên sinh viên:
                    </label>
                    <select
                      value={selectedMemberName}
                      onChange={(e) => setSelectedMemberName(e.target.value)}
                      required
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white font-medium"
                    >
                      <option value="">-- Chọn thành viên Lưu Xá --</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.fullName}>
                          {m.fullName} ({m.room || "Chưa xếp phòng"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CustomInput
                      label="Trường Đại Học"
                      placeholder="VD: ĐH Bách Khoa TP.HCM"
                      value={formUniversity}
                      onChange={(e) => setFormUniversity(e.target.value)}
                      required
                    />

                    <CustomInput
                      label="Chuyên Ngành"
                      placeholder="VD: Khoa học máy tính"
                      value={formMajor}
                      onChange={(e) => setFormMajor(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <CustomInput
                      label="Mã Số Sinh Viên (MSSV)"
                      placeholder="VD: 2310123"
                      value={formStudentId}
                      onChange={(e) => setFormStudentId(e.target.value)}
                      required
                    />

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Niên khóa</label>
                      <select
                        value={formAcademicYear}
                        onChange={(e) => setFormAcademicYear(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white"
                      >
                        <option value="2026-2027">2026-2027</option>
                        <option value="2025-2026">2025-2026</option>
                        <option value="2024-2025">2024-2025</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Học kỳ</label>
                      <select
                        value={formSemester}
                        onChange={(e) => setFormSemester(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white"
                      >
                        <option value="Học kỳ 1">Học kỳ 1</option>
                        <option value="Học kỳ 2">Học kỳ 2</option>
                        <option value="Học kỳ hè">Học kỳ hè</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Subjects List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-gray-700">
                        Danh sách môn học, điểm giữa kỳ &amp; cuối kỳ:
                      </label>
                      <button
                        type="button"
                        onClick={handleAddSubjectRow}
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm môn</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll p-2 bg-gray-50 rounded-xl">
                      {formSubjects.map((sub, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                          <input
                            type="text"
                            placeholder="Tên môn học..."
                            value={sub.subjectName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormSubjects((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, subjectName: val } : s))
                              );
                            }}
                            className="flex-1 p-1.5 rounded-md border border-gray-100 text-xs outline-none"
                            required
                          />
                          <input
                            type="number"
                            placeholder="Tín chỉ"
                            title="Số tín chỉ"
                            value={sub.credits}
                            min={1}
                            max={10}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setFormSubjects((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, credits: val } : s))
                              );
                            }}
                            className="w-14 p-1.5 rounded-md border border-gray-100 text-xs text-center outline-none"
                            required
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            placeholder="Giữa kỳ"
                            title="Điểm Giữa kỳ (hệ 10)"
                            value={sub.midtermScore}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setFormSubjects((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, midtermScore: val } : s))
                              );
                            }}
                            className="w-16 p-1.5 rounded-md border border-gray-100 text-xs text-center font-bold text-purple-700 outline-none"
                            required
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            placeholder="Cuối kỳ"
                            title="Điểm Cuối kỳ (hệ 10)"
                            value={sub.finalScore}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setFormSubjects((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, finalScore: val } : s))
                              );
                            }}
                            className="w-16 p-1.5 rounded-md border border-gray-100 text-xs text-center font-bold text-indigo-700 outline-none"
                            required
                          />
                          {formSubjects.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSubjectRow(idx)}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence Photo */}
                  <ImageUploadDropzone
                    label="Ảnh Minh Chứng Bảng Điểm / Cổng Đào Tạo (EVD)"
                    placeholder="Kéo thả ảnh chụp màn hình bảng điểm hoặc nhấp để chọn tệp từ máy..."
                    helperText="Tải ảnh chụp từ cổng sinh viên hoặc giấy xác nhận điểm (PNG, JPG, WEBP)"
                    value={formEvidencePhoto}
                    onChange={setFormEvidencePhoto}
                    required
                  />

                  {/* Aspirations */}
                  <CustomTextarea
                    label="Nguyện vọng / Mục tiêu học tập / Khó khăn"
                    placeholder="VD: Mục tiêu đạt học bổng; Cần hỗ trợ phụ đạo môn Giải tích..."
                    value={formAspirations}
                    onChange={(e) => setFormAspirations(e.target.value)}
                    rows={2}
                  />

                  {/* Toggles */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formScholarship}
                        onChange={(e) => setFormScholarship(e.target.checked)}
                        className="w-4 h-4 text-primary rounded accent-primary"
                      />
                      <span className="text-xs font-bold text-amber-900">Đạt học bổng</span>
                    </label>

                    <label className="flex items-center gap-2 p-3 bg-rose-50/60 rounded-xl border border-rose-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formSupportNeeded}
                        onChange={(e) => setFormSupportNeeded(e.target.checked)}
                        className="w-4 h-4 text-primary rounded accent-primary"
                      />
                      <span className="text-xs font-bold text-rose-900">Cần phụ đạo kèm</span>
                    </label>
                  </div>

                  {formSupportNeeded && (
                    <CustomInput
                      label="Môn học cụ thể cần anh lớn phụ đạo"
                      placeholder="VD: Giải tích 2, Kinh tế lượng..."
                      value={formSupportSubject}
                      onChange={(e) => setFormSupportSubject(e.target.value)}
                    />
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                    >
                      Lưu Bảng Điểm &amp; EVD
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
