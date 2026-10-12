// Xác nhận "Tôi đã đọc Luật nhà phiên bản …" (GET/POST /api/v1/house-rules/ack — db/app/1052) — DTO dùng chung client/server.

/** Phiên bản Luật nhà đang hiển thị (dấu vân tay nội dung các mục đang bật — app.fn_house_rules_version()). */
export interface HouseRulesVersionDto {
  version: string;
  /** Lần sửa gần nhất của các mục đang hiển thị */
  updatedAt: string | null;
  sections: number;
  clauses: number;
}

export interface HouseRulesAckMemberDto {
  memberId: string;
  name: string;
  fullName: string;
  room: string | null;
  avatarFileId: string | null;
  /** Đã xác nhận PHIÊN BẢN HIỆN HÀNH lúc nào (null = chưa) */
  ackedAt: string | null;
  /** Lần xác nhận gần nhất (có thể là phiên bản cũ) */
  lastAckedAt: string | null;
}

export interface HouseRulesAckDto {
  /** null = nhà chưa có mục luật nhà nào đang hiển thị */
  current: HouseRulesVersionDto | null;
  mine: {
    /** Đã xác nhận phiên bản hiện hành lúc nào */
    ackedAt: string | null;
    /** Lần xác nhận gần nhất (mọi phiên bản) + ngày cập nhật của phiên bản đó */
    lastAckedAt: string | null;
    lastVersionUpdatedAt: string | null;
  };
  /** Người xem có house.rules.manage (xem danh sách + nhắc) */
  canManage: boolean;
  /** Thành viên đang ở + trạng thái xác nhận (chỉ người quản lý) — chưa xác nhận lên trước */
  members: HouseRulesAckMemberDto[] | null;
  summary: { acked: number; total: number } | null;
}

/** "2026-10-07T…" → "07/10/2026" (giờ VN) */
export const rulesVersionLabel = (iso: string | null | undefined): string =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join("/") : "";
