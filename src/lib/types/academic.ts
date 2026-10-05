// DTO phân hệ Học tập (bảng điểm theo học kỳ, điểm môn do DB tính, GPA snapshot, minh chứng, nguyện vọng, phụ đạo)

export type AcademicStatus = "draft" | "submitted" | "verified" | "rejected";
export type GoalsVisibility = "private" | "leadership" | "community";

export interface SemesterDto {
  id: string;
  code: string; // HK1 | HK2 | HE
  name: string; // "Học kỳ 1"
  yearCode: string; // "2026-2027"
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
  isCurrent: boolean;
}

export interface UniversityDto {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
}

export interface GradeScaleDto {
  id: string;
  name: string;
  maxScore: number;
  processWeightPct: number;
  finalWeightPct: number;
  bands: { letter: string; minScore: number; gpaPoints: number; isPass: boolean }[];
  ranks: { label: string; minGpa4: number }[];
}

export interface AcademicMetaDto {
  semesters: SemesterDto[];
  universities: UniversityDto[];
  /** Thang mặc định toàn hệ thống — để hiển thị gợi ý cách tính (thang thực tế của từng bảng điểm nằm trong record.scale) */
  defaultScale: GradeScaleDto | null;
  /** Hồ sơ sinh viên hiện hành của người đang đăng nhập (điền sẵn biểu mẫu) */
  profile: { universityId: string | null; major: string | null; studentCode: string | null } | null;
  me: { memberId: string; fullName: string } | null;
}

export interface SubjectDto {
  id: string;
  courseId: string;
  name: string;
  credits: number;
  processScore: number | null;
  finalScore: number | null;
  officialTotalScore: number | null;
  /** Các cột dưới do trigger DB tính theo thang điểm của bảng điểm */
  totalScore: number | null;
  letterGrade: string | null;
  gpaPoints: number | null;
  isPass: boolean | null;
  countsInGpa: boolean;
}

export interface AcademicRecordDto {
  id: string;
  memberId: string;
  memberName: string; // họ tên đầy đủ
  displayName: string;
  room: string; // mã phòng hiện tại hoặc "Chưa xếp phòng"
  isOwn: boolean;
  semester: SemesterDto;
  university: { id: string; name: string; shortName: string | null };
  major: string | null;
  studentCode: string | null;
  scale: { id: string; name: string; maxScore: number; processWeightPct: number; finalWeightPct: number };
  status: AcademicStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  /** Lý do trả lại / mở lại của người xác minh */
  rejectReason: string | null;
  hasScholarship: boolean;
  scholarshipNote: string | null;
  /** GPA học kỳ: snapshot của DB khi đã nộp; bản nháp thì tạm tính từ điểm môn (gpaPreview = true) */
  gpa10: number | null;
  gpa4: number | null;
  rank: string | null;
  gpaPreview: boolean;
  creditsAttempted: number;
  creditsPassed: number;
  failedCourses: number;
  cumulative: { gpa10: number | null; gpa4: number | null; rank: string | null } | null;
  subjects: SubjectDto[];
  /** Số môn chưa có điểm tổng kết (mới có điểm quá trình/giữa kỳ) */
  incompleteCount: number;
  evidence: { fileId: string; mime: string | null } | null;
  goals: { goals: string | null; difficulties: string | null; visibility: GoalsVisibility } | null;
  /** Yêu cầu phụ đạo đang mở (gắn vào bảng điểm học kỳ mới nhất của thành viên) */
  support: { id: string; subject: string; status: string } | null;
  updatedAt: string;
  can: {
    edit: boolean;
    delete: boolean;
    submit: boolean;
    withdraw: boolean;
    verify: boolean;
    reject: boolean;
    reopen: boolean;
  };
}

export interface SubjectInput {
  name: string;
  credits: number;
  processScore?: number | null;
  finalScore?: number | null;
  officialTotalScore?: number | null;
}

export interface AcademicRecordInput {
  semesterId: string;
  universityId: string;
  major?: string | null;
  studentCode?: string | null;
  hasScholarship?: boolean;
  scholarshipNote?: string | null;
  subjects: SubjectInput[];
  evidenceFileId?: string | null;
  goals?: string | null;
  difficulties?: string | null;
  goalsVisibility?: GoalsVisibility;
  supportNeeded?: boolean;
  supportSubject?: string | null;
  /** Lưu xong thì nộp luôn để Ban điều hành xác minh */
  submit?: boolean;
}

export interface SaveRecordResult {
  record: AcademicRecordDto;
  /** Lưu nháp thành công nhưng nộp thất bại (thiếu minh chứng, thiếu điểm cuối kỳ…) */
  submitError?: string;
}

export type AcademicAction = "submit" | "withdraw" | "verify" | "reject" | "reopen";

/** GET /api/v1/academic/summary — tóm tắt cho trang Tổng quan */
export interface AcademicSummaryDto {
  currentSemester: { id: string; label: string } | null;
  mine: { recordId: string; status: AcademicStatus; gpa10: number | null; gpa4: number | null; rank: string | null } | null;
  /** Số bảng điểm đang chờ người gọi xác minh (chỉ khi có academic.verify) */
  pendingVerification: number | null;
  /** Thống kê ẩn danh học kỳ hiện tại (academic.read_aggregate, nhóm ≥ 3 người) */
  aggregate: { students: number; avgGpa4: number | null; excellentOrGood: number; scholarship: number; needSupport: number } | null;
}
