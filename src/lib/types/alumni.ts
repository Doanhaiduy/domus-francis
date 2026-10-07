// Mạng lưới cựu thành viên — DTO dùng chung client/server.

export interface AlumniDto {
  id: string;
  name: string;
  fullName: string;
  status: "alumni" | "left";
  avatarUrl?: string;
  /** Ngày rời nhà / ra trường (YYYY-MM-DD) */
  leftOn: string | null;
  leftReason: string | null;
  joinedOn: string;
  university: string | null;
  major: string | null;
  phone: string;
  email: string | null;
  graduationYear: number | null;
  occupation: string | null;
  workplace: string | null;
  city: string | null;
  /** Đã đồng ý chia sẻ thông tin trong cộng đoàn / còn giữ liên lạc */
  keepsContact: boolean;
  note: string | null;
  /** Người xem sửa được hồ sơ cựu này (người quản lý hoặc chính chủ) */
  canEdit: boolean;
}

export interface AlumniListDto {
  items: AlumniDto[];
  canManage: boolean;
}

export interface AlumniInput {
  graduationYear: number | null;
  occupation: string | null;
  workplace: string | null;
  city: string | null;
  keepsContact: boolean;
  note: string | null;
}
