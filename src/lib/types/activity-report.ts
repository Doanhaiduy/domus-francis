// Báo cáo hoạt động quý / năm — DTO dùng chung client/server (số liệu tổng hợp, không có dữ liệu cá nhân).

export type ReportKind = "quarter" | "year";

export interface ActivityReportDto {
  kind: ReportKind;
  /** Năm; quý (1–4) khi kind = quarter */
  year: number;
  quarter: number | null;
  label: string;
  from: string;
  to: string;
  generatedAt: string;
  house: { name: string; orderName: string | null; address: string | null; motto: string | null };
  members: {
    startCount: number;
    endCount: number;
    joined: number;
    becameAlumni: number;
    left: number;
    male: number;
    female: number;
    byUniversity: { name: string; count: number }[];
  };
  /** null nếu người xem không có quyền xem tài chính */
  finance: null | {
    openingVnd: number;
    incomeVnd: number;
    expenseVnd: number;
    closingVnd: number;
    duesExpectedVnd: number;
    duesCollectedVnd: number;
    collectionRatePct: number | null;
    expenseByCategory: { name: string; amountVnd: number; count: number }[];
  };
  events: {
    total: number;
    completed: number;
    cancelled: number;
    byCategory: { name: string; count: number }[];
    attendance: { present: number; late: number; absent: number; excused: number; ratePct: number | null };
  };
  duty: {
    assignments: number;
    approved: number;
    missed: number;
    excused: number;
    completionPct: number | null;
    issuesOpened: number;
    issuesDone: number;
  };
}
