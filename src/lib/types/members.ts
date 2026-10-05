// DTO phân hệ Thành viên & Nhà (giữ hình dạng tương thích giao diện cũ: Member.room = mã phòng, Floor.id = số tầng)

export interface MemberDto {
  id: string; // members.id (uuid)
  memberNo: number;
  userId: string | null;
  name: string; // display_name
  fullName: string;
  holyName?: string; // chỉ có khi được xem dữ liệu Công giáo (chính chủ hoặc lãnh đạo + đồng ý)
  room: string; // mã phòng hiện tại hoặc "Chưa xếp phòng"
  roomName?: string;
  phone: string; // "" nếu bị ẩn (hide_phone)
  email?: string;
  hidePhone: boolean;
  role: string; // nhãn chức vụ hiển thị: Trưởng nhà / Phó nhà / Thủ quỹ / Admin / Thành viên
  positionCode?: string;
  duty?: string;
  status: "active" | "on_leave" | "alumni" | "left";
  joined: string; // MM/YYYY
  joinedOn: string; // YYYY-MM-DD
  avatarText: string;
  avatarFileId?: string | null;
  avatarUrl?: string;
  gender?: "Nam" | "Nữ";
  university?: string;
  major?: string;
  academicYear?: string;
  studentCode?: string;
  diocese?: string;
  parish?: string;
  /** DD/MM/YYYY — chỉ có khi người xem được đọc thông tin riêng tư (chính chủ / cán bộ) */
  birthDate?: string;
}

/** Hồ sơ đầy đủ (sơ yếu lý lịch) — trường nào người xem không có quyền thì vắng mặt. */
export interface MemberDetailDto extends MemberDto {
  birthDateIso?: string;
  hometown?: string;
  homeAddress?: string;
  identityCard?: string; // đầy đủ nếu có quyền member.national_id.read (hoặc chính chủ), ngược lại dạng che •••• 1892
  identityMasked?: boolean;
  /** Người xem có quyền member.national_id.read — được bấm "Xem CCCD" (nhập lý do, ghi kiểm toán) */
  canRevealNationalId?: boolean;
  pastor?: string;
  dioceseId?: string | null;
  sacraments?: string[];
  fatherName?: string; // "Tên (SĐT)"
  motherName?: string;
  parentPhone?: string;
  guardians?: { id: string; relation: string; fullName: string; phone: string | null; isEmergencyContact: boolean }[];
  universityId?: string | null;
  canViewPrivate: boolean;
  canViewCatholic: boolean;
  canEdit: boolean;
  canEditPrivate: boolean;
  /** Lịch sử phân phòng */
  roomHistory?: { roomCode: string; roomName: string; startsOn: string; endsOn: string | null }[];
}

export interface FloorDto {
  id: number; // level (số tầng) — khóa dùng trên giao diện
  uuid?: string;
  code: string;
  name: string;
  description: string;
}

export interface RoomDto {
  id: string; // mã phòng "P.1"
  uuid?: string;
  name: string;
  floor: number; // level
  type: "bedroom" | "common" | "chapel" | "kitchen" | "storage" | "laundry" | "stairs" | "corridor" | "other";
  capacity: number;
  amenities: string[];
  status: "active" | "maintenance" | "reserved";
  description?: string;
  areaM2?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface HouseDto {
  floors: FloorDto[];
  rooms: RoomDto[];
}

export interface ApplicationDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  universityName: string | null;
  message: string | null;
  status: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface LookupDto {
  universities: { id: string; code: string; name: string }[];
  dioceses: { id: string; code: string; name: string }[];
}

/** Kiểu dùng chung trên giao diện: danh bạ + (tùy quyền) các trường của hồ sơ chi tiết */
export type Member = MemberDto & Partial<Omit<MemberDetailDto, keyof MemberDto>>;
export type Room = RoomDto;
export type Floor = FloorDto;
export type RoomType = RoomDto["type"];
