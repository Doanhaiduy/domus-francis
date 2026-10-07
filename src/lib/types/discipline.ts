// Vi phạm & kỷ luật — DTO dùng chung client/server.

export type PenaltyKind = "none" | "rosary" | "mass" | "duty" | "other";
export type DisciplineStatus = "open" | "completed" | "waived";
/** Giai đoạn tính từ ngày + trạng thái: chỉ ghi nhận (không phạt) · sắp tới · đang chấp hành · quá hạn chưa xác nhận xong · đã xong · được miễn */
export type DisciplinePhase = "recorded" | "upcoming" | "serving" | "overdue" | "completed" | "waived";

export const PENALTY_KINDS: PenaltyKind[] = ["none", "rosary", "mass", "duty", "other"];

export const PENALTY_LABEL: Record<PenaltyKind, string> = {
  none: "Chỉ ghi nhận (không phạt)",
  rosary: "Lần chuỗi",
  mass: "Đi lễ",
  duty: "Trực nhật",
  other: "Hình phạt khác",
};

/** Đơn vị đếm theo loại hình phạt (để hiện "5 lần chuỗi", "7 ngày đi lễ", "2 ca trực nhật"). */
export const PENALTY_UNIT: Record<PenaltyKind, string> = {
  none: "",
  rosary: "lần chuỗi",
  mass: "ngày đi lễ",
  duty: "ca trực nhật",
  other: "",
};

export const PHASE_LABEL: Record<DisciplinePhase, string> = {
  recorded: "Đã ghi nhận",
  upcoming: "Sắp chấp hành",
  serving: "Đang chấp hành",
  overdue: "Quá hạn chưa xong",
  completed: "Đã hoàn thành",
  waived: "Được miễn",
};

/** "5 lần chuỗi" / "7 ngày đi lễ" / "Dọn nhà vệ sinh tầng 2" / "Chỉ ghi nhận". */
export function penaltyText(kind: PenaltyKind, qty: number | null, detail: string | null): string {
  if (kind === "none") return "Chỉ ghi nhận";
  if (kind === "other") return detail?.trim() || PENALTY_LABEL.other;
  return `${qty ?? "?"} ${PENALTY_UNIT[kind]}${detail?.trim() ? ` — ${detail.trim()}` : ""}`;
}

export interface DisciplineRuleDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  defaultPenaltyKind: PenaltyKind;
  defaultPenaltyQty: number | null;
  defaultPenaltyNote: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Số lần điều luật này đã được dùng để ghi nhận */
  usageCount: number;
}

export interface DisciplineRecordDto {
  id: string;
  memberId: string;
  memberName: string;
  memberRoom: string | null;
  ruleId: string | null;
  ruleCode: string | null;
  ruleTitle: string;
  occurredOn: string;
  note: string | null;
  penaltyKind: PenaltyKind;
  penaltyQty: number | null;
  penaltyDetail: string | null;
  penaltyStartsOn: string | null;
  penaltyEndsOn: string | null;
  status: DisciplineStatus;
  phase: DisciplinePhase;
  completedAt: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  recordedByName: string | null;
  createdAt: string;
  isMine: boolean;
}

export interface DisciplineSummary {
  total: number;
  /** Đang xử lý: sắp tới + đang chấp hành + quá hạn */
  active: number;
  overdue: number;
  completed: number;
  waived: number;
  /** Tổng số lượng phạt theo loại (không tính bản ghi được miễn) */
  byKind: { kind: PenaltyKind; count: number; qty: number }[];
}

export interface DisciplineListDto {
  /** Có quyền ghi/sửa/xóa (discipline.manage) */
  canManage: boolean;
  /** Xem được của cả nhà (discipline.read / manage) */
  canReadAll: boolean;
  records: DisciplineRecordDto[];
  summary: DisciplineSummary;
}

export interface DisciplineQuery {
  memberId?: string;
  from?: string;
  to?: string;
  phase?: DisciplinePhase | "active" | "";
  q?: string;
  /** true = chỉ của chính mình (tab "Của tôi") */
  mine?: boolean;
}
