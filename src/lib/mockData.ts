export type RoomType = 'bedroom' | 'common' | 'chapel' | 'kitchen' | 'storage' | 'laundry' | 'stairs' | 'corridor' | 'other';

export interface Room {
  id: string; // e.g. "P.101"
  name: string; // "Phòng 101"
  floor: number; // 1, 2, 3
  type: RoomType;
  capacity: number; // maximum residents, 0 for utility/common rooms
  amenities: string[]; // ['Điều hòa', 'WC khép kín', 'Ban công thoáng', 'Bàn học cá nhân', 'Tủ quần áo gỗ']
  status: 'active' | 'maintenance' | 'reserved';
  description?: string;
  areaM2?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface Floor {
  id: number;
  name: string; // "Tầng 1 (Trệt)", "Tầng 2", "Tầng 3"
  code: string; // "T1", "T2", "T3"
  description: string;
}

export interface Member {
  id: string;
  name: string;
  fullName: string;
  holyName?: string; // Tên Thánh: Phanxicô, Giuse, Phaolô...
  room: string;
  phone: string;
  role: 'Trưởng nhà' | 'Phó nhà' | 'Thủ quỹ' | 'Admin' | 'Thành viên';
  joined: string;
  avatarText: string;
  birthDate?: string;
  gender?: 'Nam' | 'Nữ';
  identityCard?: string;
  diocese?: string; // Giáo phận
  parish?: string; // Giáo xứ
  pastor?: string; // Linh mục quản xứ
  sacraments?: string[]; // Các Bí tích
  university?: string; // Trường Đại học
  major?: string; // Chuyên ngành
  academicYear?: string; // Khóa / Niên khóa
  studentCode?: string; // Mã SV
  hometown?: string; // Quê quán
  homeAddress?: string; // Địa chỉ nhà
  fatherName?: string;
  motherName?: string;
  parentPhone?: string;
  duty?: string; // Trách vụ lưu xá
  avatarUrl?: string; // Ảnh chân dung / avatar tải lên
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: 'Thực phẩm' | 'Điện nước' | 'Vệ sinh' | 'Sửa chữa' | 'Phụng vụ' | 'Khác';
  date: string;
  paidBy: string;
  status: 'Đã duyệt' | 'Chờ duyệt' | 'Từ chối';
  note?: string;
  receiptUrl?: string; // Ảnh hóa đơn / biên lai thanh toán
}

export interface Contribution {
  memberId: string;
  name: string;
  room: string;
  amount: number;
  status: 'Đã đóng' | 'Chưa đóng';
  deadline: string;
  paidDate?: string;
}

export interface Announcement {
  id: string;
  title: string;
  preview: string;
  content: string;
  author: string;
  authorRole: string;
  date: string;
  category: 'Quan trọng' | 'Sự kiện' | 'Chung' | 'Bếp & Cơm';
  isPinned: boolean;
  isUnread: boolean;
  fileName?: string;
}

export interface MaintenanceIssue {
  id: string;
  title: string;
  location: string;
  reportedBy: string;
  date: string;
  status: 'Mới tiếp nhận' | 'Đang xử lý' | 'Đã xong';
  description: string;
  assignee?: string;
  cost?: number;
  photoUrl?: string; // Ảnh hiện trạng hỏng hóc thiết bị
}

export interface ForumThread {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: string;
  category: 'Đi chơi' | 'Bếp & Thực đơn' | 'Góp ý chung' | 'Học tập' | 'Giải trí';
  date: string;
  repliesCount: number;
  likesCount: number;
  isPinned: boolean;
  replies: Array<{
    id: string;
    author: string;
    content: string;
    time: string;
  }>;
}

export interface PrayerIntention {
  id: string;
  text: string;
  author: string;
  date: string;
  prayingCount: number;
  hasPrayed?: boolean;
}

export const INITIAL_MEMBERS: Member[] = [
  {
    id: '1',
    name: 'Minh Tuấn',
    fullName: 'Nguyễn Minh Tuấn',
    holyName: 'Giuse',
    room: 'P.204',
    phone: '0903 112 451',
    role: 'Phó nhà',
    joined: '08/2024',
    avatarText: 'MT',
    birthDate: '14/05/2003',
    gender: 'Nam',
    identityCard: '036203001892',
    diocese: 'Giáo phận Bùi Chu',
    parish: 'Giáo xứ Trung Lao',
    pastor: 'Cha Đaminh Đinh Xuân Triều',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Bách Khoa Hà Nội',
    major: 'Kỹ thuật Điều khiển & Tự động hóa',
    academicYear: 'K66 (2021 – 2026)',
    studentCode: '20210892',
    hometown: 'Xuân Trường, Nam Định',
    homeAddress: 'Xã Trung Đông, Huyện Trực Ninh, Tỉnh Nam Định',
    fatherName: 'Nguyễn Văn Thắng (0912.345.678)',
    motherName: 'Trần Thị Mai (0978.112.334)',
    parentPhone: '0912 345 678',
    duty: 'Phó nhà – Phụ trách Kỷ luật, Phòng ở & Ban Ẩm thực',
  },
  {
    id: '2',
    name: 'Văn Đức',
    fullName: 'Trần Văn Đức',
    holyName: 'Phanxicô Xaviê',
    room: 'P.101',
    phone: '0912 334 782',
    role: 'Trưởng nhà',
    joined: '09/2021',
    avatarText: 'VĐ',
    birthDate: '04/10/2001',
    gender: 'Nam',
    identityCard: '037201004512',
    diocese: 'Giáo phận Vinh',
    parish: 'Giáo xứ Cầu Rầm',
    pastor: 'Cha Phaolô Nguyễn Văn Hạnh',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Kinh Tế Quốc Dân',
    major: 'Quản trị Kinh doanh Tổng hợp',
    academicYear: 'K64 (2019 – 2024)',
    studentCode: '20194512',
    hometown: 'TP. Vinh, Nghệ An',
    homeAddress: 'Khối 3, Phường Cửa Nam, TP. Vinh, Nghệ An',
    fatherName: 'Trần Văn Quang (0988.765.432)',
    motherName: 'Nguyễn Thị Lễ',
    parentPhone: '0988 765 432',
    duty: 'Trưởng nhà – Đại diện Pháp nhân & Đối ngoại Lưu Xá',
  },
  {
    id: '3',
    name: 'Hoàng Long',
    fullName: 'Lê Hoàng Long',
    holyName: 'Phaolô',
    room: 'P.102',
    phone: '0987 220 119',
    role: 'Phó nhà',
    joined: '09/2022',
    avatarText: 'HL',
    birthDate: '18/11/2002',
    gender: 'Nam',
    identityCard: '001202008761',
    diocese: 'Tổng Giáo phận Hà Nội',
    parish: 'Giáo xứ Kẻ Sét (Thịnh Liệt)',
    pastor: 'Cha Giuse Nguyễn Văn Hữu',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Xây Dựng Hà Nội',
    major: 'Kiến trúc & Quy hoạch Đô thị',
    academicYear: 'K65 (2020 – 2025)',
    studentCode: '20208761',
    hometown: 'Hoàng Mai, Hà Nội',
    homeAddress: 'Ngõ 115 Giáp Bát, Hoàng Mai, Hà Nội',
    fatherName: 'Lê Đình Khiêm (0904.556.778)',
    motherName: 'Vũ Thị Hòa',
    parentPhone: '0904 556 778',
    duty: 'Phó nhà – Quản lý Cơ sở vật chất, Điện nước & Thiết bị',
  },
  {
    id: '4',
    name: 'Gia Bảo',
    fullName: 'Phạm Gia Bảo',
    holyName: 'Matthêu',
    room: 'P.103',
    phone: '0935 668 204',
    role: 'Thủ quỹ',
    joined: '09/2022',
    avatarText: 'GB',
    birthDate: '02/09/2002',
    gender: 'Nam',
    identityCard: '035202003341',
    diocese: 'Giáo phận Phát Diệm',
    parish: 'Giáo xứ Phúc Nhạc',
    pastor: 'Cha Phêrô Đỗ Văn Đoan',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Ngoại Thương Hà Nội',
    major: 'Tài chính Quốc tế & Ngân hàng',
    academicYear: 'K65 (2020 – 2024)',
    studentCode: '20203341',
    hometown: 'Yên Khánh, Ninh Bình',
    homeAddress: 'Xã Khánh Nhạc, Huyện Yên Khánh, Ninh Bình',
    fatherName: 'Phạm Văn Thành (0913.667.890)',
    motherName: 'Đinh Thị Thu',
    parentPhone: '0913 667 890',
    duty: 'Thủ quỹ – Thu quỹ, Quản lý Sổ sách Tài chính & Phiếu chi',
  },
  {
    id: '5',
    name: 'Quốc Việt',
    fullName: 'Vũ Quốc Việt',
    holyName: 'Antôn',
    room: 'P.104',
    phone: '0908 771 530',
    role: 'Admin',
    joined: '09/2020',
    avatarText: 'QV',
    birthDate: '22/01/2001',
    gender: 'Nam',
    identityCard: '024201009123',
    diocese: 'Giáo phận Bắc Ninh',
    parish: 'Giáo xứ Bắc Giang',
    pastor: 'Cha Phanxicô Đỗ Khắc Điển',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Bách Khoa Hà Nội',
    major: 'Khoa học Máy tính (IT1)',
    academicYear: 'K64 (2019 – 2024)',
    studentCode: '20199123',
    hometown: 'TP. Bắc Giang, Bắc Giang',
    homeAddress: 'Phường Ngô Quyền, TP. Bắc Giang',
    fatherName: 'Vũ Quang Dũng (0982.334.556)',
    motherName: 'Ngô Thị Thanh',
    parentPhone: '0982 334 556',
    duty: 'Admin Hệ thống Phần mềm Lưu Xá & Quản trị Mạng LAN',
  },
  {
    id: '6',
    name: 'Thanh Phong',
    fullName: 'Đặng Thanh Phong',
    holyName: 'Gioan Baotixita',
    room: 'P.105',
    phone: '0977 014 683',
    role: 'Thành viên',
    joined: '09/2023',
    avatarText: 'TP',
    birthDate: '10/06/2004',
    gender: 'Nam',
    identityCard: '036204005521',
    diocese: 'Giáo phận Bùi Chu',
    parish: 'Vương Cung Thánh Đường Phú Nhai',
    pastor: 'Cha Giuse Trần Quốc Hưng',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Y Hà Nội',
    major: 'Bác sĩ Đa khoa',
    academicYear: 'K121 (2022 – 2028)',
    studentCode: '20225521',
    hometown: 'Xuân Trường, Nam Định',
    homeAddress: 'Xã Xuân Phương, Huyện Xuân Trường, Nam Định',
    fatherName: 'Đặng Văn Lượng (0918.445.667)',
    motherName: 'Trịnh Thị Liên',
    parentPhone: '0918 445 667',
    duty: 'Trưởng ban Phụng vụ – Giúp Lễ & Hát Kinh Nguyện đường',
  },
  {
    id: '7',
    name: 'Văn Hiếu',
    fullName: 'Bùi Văn Hiếu',
    holyName: 'Đaminh',
    room: 'P.201',
    phone: '0966 245 901',
    role: 'Thành viên',
    joined: '09/2023',
    avatarText: 'VH',
    birthDate: '15/03/2004',
    gender: 'Nam',
    identityCard: '034204007812',
    diocese: 'Giáo phận Thái Bình',
    parish: 'Đền Thánh Bác Trạch',
    pastor: 'Cha Augustinô Bùi Văn Hoàng',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Giao Thông Vận Tải',
    major: 'Logistics & Quản lý Chuỗi Cung Ứng',
    academicYear: 'K63 (2022 – 2026)',
    studentCode: '20227812',
    hometown: 'Tiền Hải, Thái Bình',
    homeAddress: 'Xã Vân Trường, Huyện Tiền Hải, Thái Bình',
    fatherName: 'Bùi Văn Hải (0973.998.112)',
    motherName: 'Lê Thị Thuận',
    parentPhone: '0973 998 112',
    duty: 'Ban Hậu cần – Tiếp tế Lương thực & Dụng cụ Sinh hoạt',
  },
  {
    id: '8',
    name: 'Đình Khôi',
    fullName: 'Hoàng Đình Khôi',
    holyName: 'Phanxicô Assisi',
    room: 'P.202',
    phone: '0933 507 316',
    role: 'Thành viên',
    joined: '09/2024',
    avatarText: 'ĐK',
    birthDate: '08/08/2005',
    gender: 'Nam',
    identityCard: '001205004481',
    diocese: 'Tổng Giáo phận Hà Nội',
    parish: 'Giáo xứ Hàm Long',
    pastor: 'Cha Giuse Vũ Quang Học',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Sư Phạm Hà Nội',
    major: 'Sư phạm Tiếng Anh',
    academicYear: 'K73 (2023 – 2027)',
    studentCode: '20234481',
    hometown: 'Hoàn Kiếm, Hà Nội',
    homeAddress: 'Phố Hàm Long, Hoàn Kiếm, Hà Nội',
    fatherName: 'Hoàng Văn Sơn (0903.882.119)',
    motherName: 'Nguyễn Thị Oanh',
    parentPhone: '0903 882 119',
    duty: 'Trưởng ban Ẩm thực – Quản lý Thực đơn & Phân công Đi chợ',
  },
  {
    id: '9',
    name: 'Anh Khoa',
    fullName: 'Ngô Anh Khoa',
    holyName: 'Phêrô',
    room: 'P.202',
    phone: '0919 842 075',
    role: 'Thành viên',
    joined: '09/2024',
    avatarText: 'AK',
    birthDate: '12/12/2005',
    gender: 'Nam',
    identityCard: '031205001290',
    diocese: 'Giáo phận Hải Phòng',
    parish: 'Giáo xứ Kẻ Sặt',
    pastor: 'Cha Gioan Baotixita Vũ Văn Kiệm',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Kiến Trúc Hà Nội',
    major: 'Thiết kế Đồ họa & Truyền thông',
    academicYear: 'K23 (2023 – 2027)',
    studentCode: '20231290',
    hometown: 'Bình Giang, Hải Dương',
    homeAddress: 'Thị trấn Kẻ Sặt, Bình Giang, Hải Dương',
    fatherName: 'Ngô Đình Trọng (0912.774.993)',
    motherName: 'Phạm Thị Thảo',
    parentPhone: '0912 774 993',
    duty: 'Ban Truyền thông – Chụp ảnh, Thiết kế Poster & Lưu khoảnh khắc',
  },
  {
    id: '10',
    name: 'Tuấn Kiệt',
    fullName: 'Đỗ Tuấn Kiệt',
    holyName: 'Giuse',
    room: 'P.203',
    phone: '0945 390 628',
    role: 'Thành viên',
    joined: '02/2025',
    avatarText: 'TK',
    birthDate: '20/04/2005',
    gender: 'Nam',
    identityCard: '038205009843',
    diocese: 'Giáo phận Thanh Hóa',
    parish: 'Giáo xứ Ba Làng',
    pastor: 'Cha Micae Trần Văn Lâm',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Khoa Học Tự Nhiên (ĐHQGHN)',
    major: 'Hóa học Ứng dụng & Môi trường',
    academicYear: 'K68 (2023 – 2027)',
    studentCode: '20239843',
    hometown: 'Nghi Sơn, Thanh Hóa',
    homeAddress: 'Phường Hải Thanh, Thị xã Nghi Sơn, Thanh Hóa',
    fatherName: 'Đỗ Văn Dũng (0948.332.115)',
    motherName: 'Mai Thị Hường',
    parentPhone: '0948 332 115',
    duty: 'Thành viên – Phụ trách Thư viện Sách & Phòng tự học',
  },
  {
    id: '11',
    name: 'Bảo Nam',
    fullName: 'Phan Bảo Nam',
    holyName: 'Têrêsa Hài Đồng Giêsu',
    room: 'P.203',
    phone: '0972 118 457',
    role: 'Thành viên',
    joined: '09/2025',
    avatarText: 'BN',
    birthDate: '09/09/2005',
    gender: 'Nam',
    identityCard: '037205003421',
    diocese: 'Giáo phận Vinh',
    parish: 'Giáo xứ Chính Tòa Xã Đoài',
    pastor: 'Cha GB. Nguyễn Đình Dung',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'ĐH Thủy Lợi',
    major: 'Kỹ thuật Cấp thoát nước',
    academicYear: 'K65 (2023 – 2027)',
    studentCode: '20233421',
    hometown: 'Nghi Lộc, Nghệ An',
    homeAddress: 'Xã Nghi Diên, Huyện Nghi Lộc, Nghệ An',
    fatherName: 'Phan Văn Hòa (0971.229.448)',
    motherName: 'Nguyễn Thị Tuyết',
    parentPhone: '0971 229 448',
    duty: 'Thành viên – Phụ trách Sân phơi & Hệ thống Giặt là tầng 3',
  },
  {
    id: '12',
    name: 'Hữu Phước',
    fullName: 'Lý Hữu Phước',
    holyName: 'Luca',
    room: 'P.301',
    phone: '0905 663 912',
    role: 'Thành viên',
    joined: '09/2025',
    avatarText: 'HP',
    birthDate: '25/11/2005',
    gender: 'Nam',
    identityCard: '075205006612',
    diocese: 'Giáo phận Xuân Lộc',
    parish: 'Giáo xứ Gia Viên',
    pastor: 'Cha Tôma Aquinô Bùi Văn Minh',
    sacraments: ['Rửa tội', 'Thánh thể', 'Thêm sức'],
    university: 'Học Viện Báo Chí & Tuyên Truyền',
    major: 'Báo in & Xuất bản Truyền thông',
    academicYear: 'K43 (2023 – 2027)',
    studentCode: '20236612',
    hometown: 'Long Khánh, Đồng Nai',
    homeAddress: 'Phường Suối Tre, TP. Long Khánh, Đồng Nai',
    fatherName: 'Lý Văn Cường (0908.113.559)',
    motherName: 'Trần Thị Thu Thảo',
    parentPhone: '0908 113 559',
    duty: 'Thành viên – Phụ trách Âm thanh Nguyện đường & Sinh hoạt ca đoàn',
  },
];

export const INITIAL_CONTRIBUTIONS: Contribution[] = [
  { memberId: '1', name: 'Lê Minh Tuấn', room: 'P.204', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '01/10/2026' },
  { memberId: '2', name: 'Trần Văn Đức', room: 'P.101', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '01/10/2026' },
  { memberId: '3', name: 'Lê Hoàng Long', room: 'P.102', amount: 350000, status: 'Chưa đóng', deadline: '05/10/2026' },
  { memberId: '4', name: 'Phạm Gia Bảo', room: 'P.103', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '02/10/2026' },
  { memberId: '5', name: 'Vũ Quốc Việt', room: 'P.104', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '01/10/2026' },
  { memberId: '6', name: 'Đặng Thanh Phong', room: 'P.105', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '02/10/2026' },
  { memberId: '7', name: 'Bùi Văn Hiếu', room: 'P.201', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '03/10/2026' },
  { memberId: '8', name: 'Hoàng Đình Khôi', room: 'P.202', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '01/10/2026' },
  { memberId: '9', name: 'Ngô Anh Khoa', room: 'P.202', amount: 350000, status: 'Đã đóng', deadline: '05/10/2026', paidDate: '03/10/2026' },
  { memberId: '10', name: 'Đỗ Tuấn Kiệt', room: 'P.203', amount: 350000, status: 'Chưa đóng', deadline: '05/10/2026' },
  { memberId: '11', name: 'Phan Bảo Nam', room: 'P.203', amount: 350000, status: 'Chưa đóng', deadline: '05/10/2026' },
  { memberId: '12', name: 'Lý Hữu Phước', room: 'P.301', amount: 350000, status: 'Chưa đóng', deadline: '05/10/2026' },
];

export const INITIAL_EXPENSES: Expense[] = [
  // --- THÁNG 10/2026 ---
  { id: '1', name: 'Tiền chợ tuần 1 mừng lễ Bổn mạng (Thịt, cá, gia vị)', amount: 1450000, category: 'Thực phẩm', date: '04/10/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt', note: 'Chuẩn bị tiệc lễ thánh Phanxicô' },
  { id: '2', name: 'Nước rửa chén, túi rác & bột giặt tổng vệ sinh', amount: 240000, category: 'Vệ sinh', date: '03/10/2026', paidBy: 'Văn Hiếu', status: 'Đã duyệt', note: 'Tổng vệ sinh trước đại lễ' },
  { id: '3', name: 'Cước truyền hình & Internet cáp quang Viettel T10', amount: 350000, category: 'Điện nước', date: '02/10/2026', paidBy: 'Quốc Việt', status: 'Đã duyệt', note: 'Gói 300Mbps hỗ trợ học tập' },
  { id: '4', name: 'Nến thơm, hoa tươi bàn thờ & ảnh lưu niệm bổn mạng', amount: 230000, category: 'Phụng vụ', date: '01/10/2026', paidBy: 'Thanh Phong', status: 'Đã duyệt', note: 'Trang trí nguyện đường Phanxicô' },
  { id: '5', name: 'Đổi bình gas bếp chính 12kg Petrolimex', amount: 420000, category: 'Thực phẩm', date: '01/10/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt', note: 'Bình gas nấu ăn chung tầng trệt' },
  { id: '6', name: 'Thay 2 bóng đèn tuýp LED Rạng Đông tầng 2', amount: 180000, category: 'Sửa chữa', date: '01/10/2026', paidBy: 'Hoàng Long', status: 'Đã duyệt', note: 'Khắc phục đèn hành lang P.202' },

  // --- THÁNG 09/2026 ---
  { id: '7', name: 'Tiền chợ tuần 4 (Thực phẩm & gia vị)', amount: 1520000, category: 'Thực phẩm', date: '28/09/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
  { id: '8', name: 'Hóa đơn tiền điện sinh hoạt tháng 9 (EVN Hà Nội)', amount: 1180000, category: 'Điện nước', date: '25/09/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
  { id: '9', name: 'Tiền chợ tuần 3 (Rau xanh, thịt heo, trứng)', amount: 1480000, category: 'Thực phẩm', date: '21/09/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
  { id: '10', name: 'Bảo dưỡng máy giặt Electrolux & thay van cấp', amount: 220000, category: 'Sửa chữa', date: '16/09/2026', paidBy: 'Hoàng Long', status: 'Đã duyệt' },
  { id: '11', name: 'In sách kinh phụng vụ & thánh ca năm học mới', amount: 250000, category: 'Phụng vụ', date: '12/09/2026', paidBy: 'Thanh Phong', status: 'Đã duyệt' },
  { id: '12', name: 'Liên hoan huynh đệ đón chào tân sinh viên K68', amount: 750000, category: 'Thực phẩm', date: '05/09/2026', paidBy: 'Trần Văn Đức', status: 'Đã duyệt' },

  // --- THÁNG 08/2026 ---
  { id: '13', name: 'Tiền nước sạch sinh hoạt tháng 8 (Công ty Nước sạch)', amount: 380000, category: 'Điện nước', date: '28/08/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
  { id: '14', name: 'Quét sơn dặm tường phòng khách & hành lang', amount: 450000, category: 'Sửa chữa', date: '22/08/2026', paidBy: 'Hoàng Long', status: 'Đã duyệt' },
  { id: '15', name: 'Tiền chợ sinh hoạt tuần 3 tháng 8', amount: 1390000, category: 'Thực phẩm', date: '18/08/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
  { id: '16', name: 'Dâng hoa & lễ tạ ơn Lễ Đức Mẹ Hồn Xác Lên Trời', amount: 300000, category: 'Phụng vụ', date: '15/08/2026', paidBy: 'Minh Tuấn', status: 'Đã duyệt' },
  { id: '17', name: 'Thay 3 lõi lọc nước máy RO Kangaroo', amount: 290000, category: 'Sửa chữa', date: '08/08/2026', paidBy: 'Quốc Việt', status: 'Đã duyệt' },
  { id: '18', name: 'Tiền chợ tuần 1 chuẩn bị mở cửa đón sinh viên', amount: 1450000, category: 'Thực phẩm', date: '03/08/2026', paidBy: 'Gia Bảo', status: 'Đã duyệt' },
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: '1',
    title: 'Kế hoạch tổng vệ sinh & Chuẩn bị lễ bổn mạng thánh Phanxicô',
    preview: 'Thứ Bảy tuần này toàn thể anh em có mặt lúc 7h00 sáng để cùng dọn dẹp khuôn viên, kiểm tra lại thiết bị...',
    content: 'Chào toàn thể anh em Lưu Xá,\n\nĐể chuẩn bị cho ngày lễ Bổn mạng của Lưu xá vào ngày 04/10 tới đây, Ban đại diện xin thông báo kế hoạch tổng vệ sinh và phân công nhiệm vụ cụ thể như sau:\n\n1. Thời gian: 07h00 - 10h30 Thứ Bảy (03/10/2026).\n2. Phân công: Khu A phụ trách vệ sinh sân và nhà nguyện; Khu B phụ trách lau dọn phòng khách và hành lang các tầng.\n3. Lưu ý: Mọi thành viên có mặt đúng giờ, trang phục thoải mái. Sau giờ tổng vệ sinh sẽ có bữa trưa liên hoan nhẹ tại phòng ăn chung.\n\n*Rất mong tinh thần tự giác, nhiệt tình và hiệp thông đầy trách nhiệm của tất cả anh em để ngày lễ diễn ra thật sốt sắng, gắn kết.',
    author: 'Nguyễn Trọng Hiếu',
    authorRole: 'Trưởng nhà · Phòng 201',
    date: '10:30 · 01/10/2026',
    category: 'Quan trọng',
    isPinned: true,
    isUnread: true,
    fileName: 'Ke_hoach_Le_Bon_Mang_2026.pdf',
  },
  {
    id: '2',
    title: 'Cập nhật thực đơn & lịch trực bếp tuần đầu tháng 10',
    preview: 'Các bạn trực bếp chú ý hạn chốt báo cơm trưa là 9:00 và tối là 15:00 để bạn đi chợ chuẩn bị đúng lượng...',
    content: 'Kính gửi cả nhà, lịch thực đơn tuần mới đã được ban quản lý bếp phê duyệt trên hệ thống. Đề nghị anh em đăng ký cơm đúng giờ.',
    author: 'Minh Tuấn',
    authorRole: 'Phó nhà · Hôm qua',
    date: '18:00 · 30/09/2026',
    category: 'Bếp & Cơm',
    isPinned: false,
    isUnread: true,
  },
  {
    id: '3',
    title: 'Báo cáo thu chi quỹ sinh hoạt tháng 9/2026',
    preview: 'Thủ quỹ đã hoàn tất đối soát chứng từ và hóa đơn điện nước tháng vừa qua. Anh em xem chi tiết tại tab Thu Chi.',
    content: 'Tổng kết thu chi tháng 9 đã hoàn thành, số dư chuyển sang tháng 10 là 8.170.000đ. Mọi người có thắc mắc vui lòng liên hệ thủ quỹ.',
    author: 'Đình Khôi',
    authorRole: 'Thủ quỹ · 3 ngày trước',
    date: '09:00 · 28/09/2026',
    category: 'Chung',
    isPinned: false,
    isUnread: false,
  }
];

export const INITIAL_ISSUES: MaintenanceIssue[] = [
  {
    id: 'LOG-108',
    title: 'Bóng đèn hành lang Tầng 2 bị cháy chập',
    location: 'Hành lang Tầng 2 (Cửa 203)',
    reportedBy: 'Trần Hùng (P.201)',
    date: 'Hôm nay 14:20',
    status: 'Mới tiếp nhận',
    description: 'Cần thay bóng LED tuýp hoặc kiểm tra tăng phô điện trước 18:00 hôm nay.',
    cost: 120000,
  },
  {
    id: 'LOG-107',
    title: 'Vòi sen phòng tắm Khu B rỉ nước liên tục',
    location: 'Phòng tắm nam T1',
    reportedBy: 'Đình Khôi (P.202)',
    date: 'Hôm qua',
    status: 'Đang xử lý',
    description: 'Nước nhỏ giọt liên tục gây ồn và lãng phí nước sinh hoạt chung của dãy.',
    assignee: 'Văn Bình (Đã khảo sát, đang ra tiệm điện nước mua gioăng cao su 21mm)',
  },
  {
    id: 'LOG-105',
    title: 'Bản lề cửa sổ phòng 204 bị kẹt gãy chốt',
    location: 'Phòng 204',
    reportedBy: 'Minh Tuấn',
    date: '2 ngày trước',
    status: 'Đã xong',
    description: 'Gió giật làm lệch bản lề inox, không đóng kín được then gài. Đã thay mới bộ bản lề cối 120k.',
    cost: 120000,
  }
];

export const INITIAL_FORUM_THREADS: ForumThread[] = [
  {
    id: '1',
    title: 'Kế hoạch dã ngoại Vũng Tàu kỷ niệm Lễ Bổn Mạng tháng 10: Lấy ý kiến toàn nhà!',
    content: 'Chào anh em, Ban Đại Diện dự kiến tổ chức chuyến đi biển 1 ngày vào Chúa Nhật cuối tháng. Chi phí dự kiến trích 30% từ quỹ chung, phần còn lại anh em đóng góp nhẹ. Mời anh em cho ý kiến về phương tiện và lịch trình...',
    author: 'Lê Hoàng Long',
    authorRole: 'Phó nhà',
    category: 'Đi chơi',
    date: 'Hôm qua · 21:30',
    repliesCount: 18,
    likesCount: 14,
    isPinned: true,
    replies: [
      { id: 'r1', author: 'Trần Văn Đức (Trưởng nhà)', content: 'Ủng hộ chuyến đi! Nhớ sắp xếp trước người trực cổng và tưới cây ở nhà nhé Long.', time: 'Hôm qua 22:00' },
      { id: 'r2', author: 'Phạm Gia Bảo (Thủ quỹ)', content: 'Em đã dự toán quỹ dư khoảng 1.200.000đ có thể tài trợ cho tiền xe và nước uống của cả nhà.', time: 'Hôm nay 07:15' }
    ]
  },
  {
    id: '2',
    title: 'Góp ý món ăn tuần mới: Đổi bún riêu cua sang bún bò Huế thứ Tư',
    content: 'Nhiều anh em đề xuất thứ Tư tuần tới chuyển sang bún bò Huế cho đổi vị. Đội đi chợ sáng thứ Tư đã khảo sát sườn bò ngon ở chợ Thủ Đức...',
    author: 'Phạm Gia Bảo',
    authorRole: 'Thủ quỹ & Bếp',
    category: 'Bếp & Thực đơn',
    date: '2 giờ trước',
    repliesCount: 9,
    likesCount: 7,
    isPinned: false,
    replies: []
  },
  {
    id: '3',
    title: 'Đề xuất mua thêm 1 ổ cắm dài chịu tải cao cho phòng sinh hoạt chung',
    content: 'Buổi tối anh em ngồi học chung và làm bài tập nhóm thường thiếu ổ cắm cắm laptop. Em xin ý kiến thủ quỹ xuất quỹ mua 1 ổ cắm chống sét khoảng 150k...',
    author: 'Hoàng Đình Khôi',
    authorRole: 'P.202',
    category: 'Góp ý chung',
    date: 'Hôm qua',
    repliesCount: 12,
    likesCount: 11,
    isPinned: false,
    replies: []
  }
];

export const INITIAL_PRAYERS: PrayerIntention[] = [
  { id: '1', text: 'Xin cầu nguyện cho kỳ thi tốt nghiệp và phỏng vấn xin việc của anh Trọng Hiếu tuần tới được bình an và may mắn.', author: 'Ẩn danh', date: '2 giờ trước', prayingCount: 8, hasPrayed: true },
  { id: '2', text: 'Cầu nguyện cho bố của bạn Quang Huy đang nằm viện tại quê sớm bình phục sức khỏe.', author: 'Quang Huy', date: 'Hôm qua', prayingCount: 12, hasPrayed: false },
  { id: '3', text: 'Tạ ơn Chúa vì kỳ tĩnh tâm đầu năm học của toàn thể anh em Lưu Xá mang lại nhiều hoa trái thiêng liêng.', author: 'Văn Đức', date: '3 ngày trước', prayingCount: 15, hasPrayed: true }
];

export interface EventPollOption {
  id: string;
  text: string;
  votes: string[]; // member names who voted for this option
}

export interface EventPoll {
  id: string;
  question: string;
  options: EventPollOption[];
  createdAt: string;
  isClosed?: boolean;
}

export interface EventCheckInRecord {
  memberId: string;
  memberName: string;
  room?: string;
  checkedInAt: string;
  status: 'present' | 'late' | 'absent';
  note?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  category: 'Phụng vụ' | 'Họp nhà' | 'Bổn mạng' | 'Dã ngoại' | 'Sinh hoạt';
  organizer: string;
  description?: string;
  hasCheckIn?: boolean;
  checkIns?: EventCheckInRecord[];
  poll?: EventPoll;
}

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Thánh lễ Bổn mạng Lưu Xá Phanxicô",
    date: "04/10/2026",
    time: "08:30 sáng",
    location: "Nhà nguyện Lưu xá",
    category: "Bổn mạng",
    organizer: "Ban Phụng vụ",
    description: "Thánh lễ tạ ơn mừng quan thầy Thánh Phanxicô Assisi, tiệc ngọt huynh đệ và chụp hình lưu niệm.",
    hasCheckIn: true,
    checkIns: [
      { memberId: "m1", memberName: "Trần Văn Đức", room: "P.201", checkedInAt: "08:15", status: "present" },
      { memberId: "m2", memberName: "Minh Tuấn", room: "P.204", checkedInAt: "08:18", status: "present" },
      { memberId: "m3", memberName: "Lê Hoàng Long", room: "P.202", checkedInAt: "08:20", status: "present" },
      { memberId: "m4", memberName: "Phạm Gia Bảo", room: "P.301", checkedInAt: "08:22", status: "present" },
      { memberId: "m5", memberName: "Vũ Quốc Việt", room: "P.102", checkedInAt: "08:25", status: "present" },
      { memberId: "m6", memberName: "Đặng Thanh Phong", room: "P.203", checkedInAt: "08:26", status: "present" },
      { memberId: "m7", memberName: "Bùi Văn Hiếu", room: "P.302", checkedInAt: "08:32", status: "late", note: "Hỗ trợ ban đàn hát chuẩn bị micro" },
    ],
  },
  {
    id: "evt-2",
    title: "Họp nhà định kỳ Tháng 10",
    date: "04/10/2026",
    time: "19:30 tối",
    location: "Phòng sinh hoạt chung T2",
    category: "Họp nhà",
    organizer: "Trần Văn Đức (Trưởng nhà)",
    description: "Tổng kết tháng 9, triển khai nội quy năm học mới và đối soát thu chi quỹ chung.",
    hasCheckIn: true,
    checkIns: [
      { memberId: "m1", memberName: "Trần Văn Đức", room: "P.201", checkedInAt: "19:15", status: "present" },
      { memberId: "m2", memberName: "Minh Tuấn", room: "P.204", checkedInAt: "19:20", status: "present" },
      { memberId: "m3", memberName: "Lê Hoàng Long", room: "P.202", checkedInAt: "19:28", status: "present" },
      { memberId: "m4", memberName: "Phạm Gia Bảo", room: "P.301", checkedInAt: "19:35", status: "late", note: "Kẹt xe trên đường đi học về" },
    ],
    poll: {
      id: "poll-1",
      question: "Biểu quyết: Khung giờ họp nhà định kỳ hàng tháng phù hợp nhất",
      options: [
        { id: "opt-1", text: "Tối Thứ Sáu (20:00 - 21:30)", votes: ["Trần Văn Đức", "Minh Tuấn", "Lê Hoàng Long"] },
        { id: "opt-2", text: "Tối Chúa Nhật (19:30 - 21:00)", votes: ["Phạm Gia Bảo", "Vũ Quốc Việt", "Đặng Thanh Phong", "Bùi Văn Hiếu"] },
        { id: "opt-3", text: "Sáng Chúa Nhật sau Thánh Lễ (10:00 - 11:30)", votes: ["Hoàng Nam"] },
      ],
      createdAt: "01/10/2026",
    },
  },
  {
    id: "evt-3",
    title: "Giờ Kinh Tối & Chầu Thánh Thể đầu tháng",
    date: "02/10/2026",
    time: "20:30 tối",
    location: "Nguyện đường T3",
    category: "Phụng vụ",
    organizer: "Ban Phụng vụ",
    description: "Hiệp thông cầu nguyện cho quý ân nhân và gia đình các thành viên.",
    hasCheckIn: true,
    checkIns: [
      { memberId: "m1", memberName: "Trần Văn Đức", room: "P.201", checkedInAt: "20:20", status: "present" },
      { memberId: "m2", memberName: "Minh Tuấn", room: "P.204", checkedInAt: "20:25", status: "present" },
    ],
  },
  {
    id: "evt-4",
    title: "Dã ngoại Chân Đền Thánh Giuse",
    date: "18/10/2026",
    time: "06:00 sáng",
    location: "Khu dã ngoại Núi Cúi",
    category: "Dã ngoại",
    organizer: "Ban Sinh hoạt & Hậu cần",
    description: "Chuyến đi gắn kết tinh thần huynh đệ đầu năm học mới.",
    hasCheckIn: false,
    poll: {
      id: "poll-2",
      question: "Bình chọn: Phương tiện di chuyển cho chuyến dã ngoại Núi Cúi",
      options: [
        { id: "opt-2-1", text: "Đi xe máy theo đoàn (gắn kết phượt thủ, linh hoạt)", votes: ["Minh Tuấn", "Vũ Quốc Việt"] },
        { id: "opt-2-2", text: "Thuê xe du lịch 29 chỗ (an toàn, chở được nhiều dụng cụ hậu cần)", votes: ["Trần Văn Đức", "Lê Hoàng Long", "Phạm Gia Bảo", "Bùi Văn Hiếu"] },
      ],
      createdAt: "02/10/2026",
    },
  },
];

export const INITIAL_FLOORS: Floor[] = [
  { id: 1, name: 'Tầng 1 (Tầng trệt)', code: 'T1', description: 'Phòng sinh viên P.101 - P.105, Bếp ăn và Kho vật tư' },
  { id: 2, name: 'Tầng 2', code: 'T2', description: 'Phòng sinh viên P.201 - P.204, Phòng Sinh hoạt chung & Thư viện tự học' },
  { id: 3, name: 'Tầng 3 (Tầng thượng)', code: 'T3', description: 'Phòng P.301 - P.302, Nguyện đường Thánh Phanxicô & Sân phơi đồ' },
];

export const INITIAL_ROOMS: Room[] = [
  // Tầng 1
  {
    id: 'P.101',
    name: 'Phòng 101',
    floor: 1,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'WC khép kín', 'Quạt trần', 'Bàn học cá nhân', 'Tủ quần áo gỗ'],
    status: 'active',
    areaM2: 24,
    x: 30,
    y: 30,
    w: 220,
    h: 160,
    description: 'Phòng tầng trệt gần sảnh đón, thoáng mát và tiện đi lại.',
  },
  {
    id: 'P.102',
    name: 'Phòng 102',
    floor: 1,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'WC khép kín', 'Bàn học cá nhân', 'Tủ quần áo'],
    status: 'active',
    areaM2: 24,
    x: 30,
    y: 210,
    w: 220,
    h: 160,
    description: 'Phòng rộng rãi, bàn học đôi và cửa sổ mở ra hiên hoa.',
  },
  {
    id: 'P.103',
    name: 'Phòng 103',
    floor: 1,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Quạt trần', 'Bàn học cá nhân', 'Bình nóng lạnh'],
    status: 'active',
    areaM2: 22,
    x: 30,
    y: 390,
    w: 220,
    h: 160,
    description: 'Phòng tiêu chuẩn 2 giường đơn, ánh sáng tự nhiên.',
  },
  {
    id: 'P.104',
    name: 'Phòng 104',
    floor: 1,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'WC khép kín', 'Tủ quần áo gỗ', 'Quạt trần'],
    status: 'active',
    areaM2: 22,
    x: 390,
    y: 30,
    w: 210,
    h: 160,
    description: 'Phòng yên tĩnh, thích hợp cho các bạn năm cuối làm khóa luận.',
  },
  {
    id: 'P.105',
    name: 'Phòng 105',
    floor: 1,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Quạt trần', 'Bàn học cá nhân'],
    status: 'active',
    areaM2: 20,
    x: 390,
    y: 210,
    w: 210,
    h: 160,
    description: 'Phòng gần lối ra vườn sau, thông thoáng.',
  },
  {
    id: 'P.BEP',
    name: 'Gian Bếp & Nhà Ăn',
    floor: 1,
    type: 'kitchen',
    capacity: 0,
    amenities: ['Bếp gas công nghiệp', 'Tủ lạnh 4 cánh', 'Bàn ăn 16 chỗ', 'Máy lọc nước RO', 'Nồi cơm điện lớn'],
    status: 'active',
    areaM2: 40,
    x: 630,
    y: 30,
    w: 280,
    h: 520,
    description: 'Khu vực nấu nướng, sinh hoạt và dùng bữa cơm huynh đệ mỗi ngày.',
  },
  {
    id: 'P.KHO1',
    name: 'Kho Dụng Cụ T1',
    floor: 1,
    type: 'storage',
    capacity: 0,
    amenities: ['Kệ sắt chịu lực', 'Hộp đồ nghề kỹ thuật', 'Thang nhôm'],
    status: 'active',
    areaM2: 12,
    x: 390,
    y: 390,
    w: 210,
    h: 160,
    description: 'Nơi lưu trữ dụng cụ lao động, máy móc và vật tư dự phòng.',
  },
  {
    id: 'P.THANG1',
    name: 'Cầu Thang T1',
    floor: 1,
    type: 'stairs',
    capacity: 0,
    amenities: ['Tay vịn gỗ', 'Đèn cảm ứng', 'Bình cứu hỏa'],
    status: 'active',
    areaM2: 10,
    x: 260,
    y: 30,
    w: 110,
    h: 80,
    description: 'Cầu thang bộ chính kết nối từ tầng trệt lên tầng 2.',
  },

  // Tầng 2
  {
    id: 'P.201',
    name: 'Phòng 201',
    floor: 2,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Ban công thoáng', 'WC khép kín', 'Bàn học đôi', 'Bình nóng lạnh'],
    status: 'active',
    areaM2: 26,
    x: 30,
    y: 30,
    w: 230,
    h: 250,
    description: 'Phòng góc lầu 2 có ban công rộng ngắm hoàng hôn.',
  },
  {
    id: 'P.202',
    name: 'Phòng 202',
    floor: 2,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Ban công thoáng', 'WC khép kín', 'Tủ sách treo'],
    status: 'active',
    areaM2: 25,
    x: 30,
    y: 300,
    w: 230,
    h: 250,
    description: 'Phòng có ban công riêng biệt, view cây xanh mát mẻ.',
  },
  {
    id: 'P.203',
    name: 'Phòng 203',
    floor: 2,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Quạt trần', 'Bàn học cá nhân', 'WC riêng'],
    status: 'active',
    areaM2: 22,
    x: 370,
    y: 30,
    w: 220,
    h: 250,
    description: 'Phòng ấm cúng giữa hành lang lầu 2.',
  },
  {
    id: 'P.204',
    name: 'Phòng 204',
    floor: 2,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Cửa sổ đón nắng', 'Tủ quần áo gỗ', 'Bàn học'],
    status: 'active',
    areaM2: 23,
    x: 370,
    y: 300,
    w: 220,
    h: 250,
    description: 'Phòng đối diện thư viện, yên tĩnh tuyệt đối.',
  },
  {
    id: 'P.SHC',
    name: 'Phòng Sinh Hoạt & Tự Học',
    floor: 2,
    type: 'common',
    capacity: 0,
    amenities: ['Bảng từ trắng', 'Bàn họp chữ nhật lớn', 'Máy chiếu Full HD', 'Kệ sách sinh viên', 'Wifi tốc độ cao'],
    status: 'active',
    areaM2: 35,
    x: 620,
    y: 30,
    w: 290,
    h: 520,
    description: 'Không gian họp nhà, học nhóm, seminar chia sẻ và tiếp đón khách.',
  },

  {
    id: 'P.THANG2',
    name: 'Cầu Thang T2',
    floor: 2,
    type: 'stairs',
    capacity: 0,
    amenities: ['Tay vịn gỗ', 'Đèn cảm ứng'],
    status: 'active',
    areaM2: 10,
    x: 260,
    y: 30,
    w: 100,
    h: 80,
    description: 'Cầu thang kết nối tầng 2 lên tầng 3 và xuống tầng 1.',
  },

  // Tầng 3
  {
    id: 'P.301',
    name: 'Phòng 301',
    floor: 3,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'Ban công thoáng', 'Yên tĩnh tuyệt đối', 'Bàn học cá nhân'],
    status: 'active',
    areaM2: 24,
    x: 30,
    y: 30,
    w: 230,
    h: 250,
    description: 'Phòng trên tầng 3 sát hoa viên sân thượng, gió trời lồng lộng.',
  },
  {
    id: 'P.302',
    name: 'Phòng 302 (Dự phòng)',
    floor: 3,
    type: 'bedroom',
    capacity: 2,
    amenities: ['Điều hòa', 'WC khép kín', 'Quạt trần', 'Giường tầng thông minh'],
    status: 'active',
    areaM2: 24,
    x: 30,
    y: 300,
    w: 230,
    h: 250,
    description: 'Phòng mới bảo trì sơn mới, sẵn sàng đón sinh viên mới gia nhập.',
  },
  {
    id: 'P.NGUYEN',
    name: 'Nguyện Đường Thánh Phanxicô',
    floor: 3,
    type: 'chapel',
    capacity: 0,
    amenities: ['Bàn thờ gỗ sồi', 'Đàn Organ Yamaha', 'Hệ thống âm thanh thánh ca', 'Thảm quỳ nguyện', 'Máy lạnh 2HP'],
    status: 'active',
    areaM2: 45,
    x: 290,
    y: 30,
    w: 340,
    h: 520,
    description: 'Trái tim của Lưu xá – Không gian thánh thiêng cử hành Giờ Kinh Tối, Chầu Thánh Thể và Thánh lễ.',
  },
  {
    id: 'P.GIAT',
    name: 'Sân Phơi & Khu Giặt Đồ',
    floor: 3,
    type: 'laundry',
    capacity: 0,
    amenities: ['2 Máy giặt Electrolux', 'Mái che lấy sáng', 'Giàn phơi inox thông minh', 'Vòi rửa áp lực'],
    status: 'active',
    areaM2: 32,
    x: 660,
    y: 30,
    w: 250,
    h: 520,
    description: 'Khu giặt và phơi quần áo có lịch phân ca khoa học, đón nắng tối đa.',
  },
  {
    id: 'P.THANG3',
    name: 'Cầu Thang T3',
    floor: 3,
    type: 'stairs',
    capacity: 0,
    amenities: ['Tay vịn gỗ', 'Cửa sập sân thượng'],
    status: 'active',
    areaM2: 10,
    x: 260,
    y: 30,
    w: 100,
    h: 80,
    description: 'Lối cầu thang dẫn lên sân thượng và nguyện đường.',
  },
];

// =========================================================================
// CONFIGURATION & CATEGORY MANAGEMENT
// =========================================================================
export interface CategoryItem {
  id: string;
  name: string;
  code: string;
  type: 'expense' | 'event' | 'announcement' | 'forum' | 'maintenance';
  description?: string;
  color: string;
  iconName?: string;
  count?: number;
  isActive: boolean;
}

export const INITIAL_CATEGORIES: CategoryItem[] = [
  // Thu Chi
  { id: 'cat-tc-1', name: 'Thực phẩm & Đi chợ', code: 'FOOD', type: 'expense', description: 'Chi phí mua thực phẩm bữa trưa/tối, gia vị, dầu ăn, gas nấu', color: '#f59e0b', iconName: 'UtensilsCrossed', count: 32, isActive: true },
  { id: 'cat-tc-2', name: 'Điện, Nước & Internet', code: 'UTILITY', type: 'expense', description: 'Hóa đơn tiền điện sinh hoạt, nước máy, cước cáp quang hàng tháng', color: '#3b82f6', iconName: 'Zap', count: 12, isActive: true },
  { id: 'cat-tc-3', name: 'Vệ sinh & Hóa phẩm', code: 'CLEAN', type: 'expense', description: 'Nước rửa chén, xà phòng, bao rác, chổi lau sàn các tầng', color: '#10b981', iconName: 'Sparkles', count: 8, isActive: true },
  { id: 'cat-tc-4', name: 'Sửa chữa & Cơ sở vật chất', code: 'REPAIR', type: 'expense', description: 'Bóng đèn, khóa cửa, sửa vòi sen, thay linh kiện quạt', color: '#ef4444', iconName: 'Wrench', count: 6, isActive: true },
  { id: 'cat-tc-5', name: 'Phụng vụ & Thánh lễ', code: 'LITURGY', type: 'expense', description: 'Nến thơm, hoa tươi bàn thờ, rượu lễ, bánh lễ', color: '#8b5cf6', iconName: 'Church', count: 14, isActive: true },
  { id: 'cat-tc-6', name: 'Tiếp đón khách & Giao lưu', code: 'GUEST', type: 'expense', description: 'Hoa quả, trà nước tiếp đón quý cha, ân nhân và phụ huynh', color: '#ec4899', iconName: 'HeartHandshake', count: 5, isActive: true },

  // Sự kiện
  { id: 'cat-ev-1', name: 'Phụng vụ & Thánh lễ', code: 'EVT_MASS', type: 'event', description: 'Thánh lễ bổn mạng, giờ kinh tối, tĩnh tâm tháng', color: '#8b5cf6', iconName: 'Church', count: 18, isActive: true },
  { id: 'cat-ev-2', name: 'Họp nhà huynh đệ', code: 'EVT_MEET', type: 'event', description: 'Họp tổng kết tháng, họp ban đại diện, đối soát quỹ', color: '#3b82f6', iconName: 'Users', count: 10, isActive: true },
  { id: 'cat-ev-3', name: 'Đại lễ Bổn mạng', code: 'EVT_PATRON', type: 'event', description: 'Lễ kính Thánh Phanxicô Assisi 04/10', color: '#f59e0b', iconName: 'Crown', count: 2, isActive: true },
  { id: 'cat-ev-4', name: 'Dã ngoại & Hành hương', code: 'EVT_TRIP', type: 'event', description: 'Các chuyến đi biển, hành hương thánh địa', color: '#10b981', iconName: 'Compass', count: 4, isActive: true },
  { id: 'cat-ev-5', name: 'Tổng vệ sinh định kỳ', code: 'EVT_CLEAN', type: 'event', description: 'Dọn dẹp khuôn viên, phát quang sân thượng thứ Bảy', color: '#06b6d4', iconName: 'Brush', count: 12, isActive: true },

  // Thông báo
  { id: 'cat-an-1', name: 'Quan trọng & Khẩn', code: 'ANN_URGENT', type: 'announcement', description: 'Quy định nội quy, lịch đóng quỹ, thông báo từ Cha linh hướng', color: '#ef4444', iconName: 'AlertTriangle', count: 6, isActive: true },
  { id: 'cat-an-2', name: 'Sự kiện & Hoạt động', code: 'ANN_EVENT', type: 'announcement', description: 'Kế hoạch chương trình, đăng ký tham gia hoạt động', color: '#8b5cf6', iconName: 'Calendar', count: 9, isActive: true },
  { id: 'cat-an-3', name: 'Bếp & Đăng ký cơm', code: 'ANN_KITCHEN', type: 'announcement', description: 'Thực đơn tuần mới, giờ chốt suất ăn', color: '#f59e0b', iconName: 'UtensilsCrossed', count: 15, isActive: true },
  { id: 'cat-an-4', name: 'Sinh hoạt chung', code: 'ANN_COMMON', type: 'announcement', description: 'Nhắc nhở nếp sống, giữ gìn trật tự và vệ sinh', color: '#3b82f6', iconName: 'Megaphone', count: 11, isActive: true },

  // Diễn đàn
  { id: 'cat-fo-1', name: 'Học tập & Hướng nghiệp', code: 'FORUM_STUDY', type: 'forum', description: 'Trao đổi tài liệu, ôn thi, kinh nghiệm phỏng vấn việc làm', color: '#3b82f6', iconName: 'BookOpen', count: 18, isActive: true },
  { id: 'cat-fo-2', name: 'Đi chơi & Thể thao', code: 'FORUM_SPORT', type: 'forum', description: 'Đá bóng chiều thứ Bảy, cầu lông, leo núi', color: '#10b981', iconName: 'Trophy', count: 14, isActive: true },
  { id: 'cat-fo-3', name: 'Bếp & Thực đơn', code: 'FORUM_FOOD', type: 'forum', description: 'Đề xuất món ăn, phản hồi chất lượng bữa cơm', color: '#f59e0b', iconName: 'UtensilsCrossed', count: 20, isActive: true },
  { id: 'cat-fo-4', name: 'Góp ý xây dựng', code: 'FORUM_FEEDBACK', type: 'forum', description: 'Đóng góp ý kiến cải tiến cơ sở vật chất và nếp sống', color: '#8b5cf6', iconName: 'MessageSquare', count: 9, isActive: true },

  // Báo hỏng
  { id: 'cat-hc-1', name: 'Hệ thống điện & Chiếu sáng', code: 'MAINT_ELEC', type: 'maintenance', description: 'Bóng đèn, quạt trần, ổ cắm, máy lạnh', color: '#f59e0b', iconName: 'Zap', count: 8, isActive: true },
  { id: 'cat-hc-2', name: 'Nước & Thiết bị vệ sinh', code: 'MAINT_WATER', type: 'maintenance', description: 'Vòi sen, lavabo, bồn cầu, máy bơm nước', color: '#3b82f6', iconName: 'Droplet', count: 7, isActive: true },
  { id: 'cat-hc-3', name: 'Đồ gỗ, Cửa & Khóa', code: 'MAINT_DOOR', type: 'maintenance', description: 'Bản lề, then cửa, bàn học, giường tủ', color: '#8b5cf6', iconName: 'Key', count: 5, isActive: true },
  { id: 'cat-hc-4', name: 'Thiết bị bếp & Máy giặt', code: 'MAINT_APP', type: 'maintenance', description: 'Bếp gas, máy giặt, máy lọc nước, tủ lạnh', color: '#10b981', iconName: 'Cpu', count: 4, isActive: true },
];

// =========================================================================
// MOMENTS & MEMORY GALLERY (LƯU KHOẢNH KHẮC)
// =========================================================================
export interface MomentPhoto {
  id: string;
  url: string;
  caption?: string;
  uploadedBy: string;
  date: string;
  likesCount: number;
}

export interface MomentAlbum {
  id: string;
  title: string;
  description: string;
  category: 'Hành hương' | 'Dã ngoại & Du lịch' | 'Lễ Bổn Mạng' | 'Bữa cơm huynh đệ' | 'Sinh hoạt thường nhật' | 'Chia tay & Tốt nghiệp';
  date: string;
  year: number;
  month: number;
  location: string;
  coverPhoto: string;
  photos: MomentPhoto[];
  author: string;
  authorRole: string;
  tags: string[];
  isFeatured?: boolean;
  participants: string[];
  likesCount: number;
  isLiked?: boolean;
}

export const INITIAL_MOMENTS: MomentAlbum[] = [
  {
    id: 'alb-2026-1',
    title: 'Đại Lễ Mừng Bổn Mạng Thánh Phanxicô Assisi 2026',
    description: 'Thánh lễ tạ ơn trang trọng tại nguyện đường lưu xá, có sự hiện diện hiệp thông của quý Cha linh hướng, quý Dì, quý ân nhân và cựu sinh viên các khóa.',
    category: 'Lễ Bổn Mạng',
    date: '04/10/2026',
    year: 2026,
    month: 10,
    location: 'Nguyện đường Lưu Xá Phanxicô',
    coverPhoto: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-1',
        url: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=1200&q=80',
        caption: 'Đoàn đồng tế thánh lễ tạ ơn mừng kính quan thầy Phanxicô',
        uploadedBy: 'Trần Văn Đức',
        date: '04/10/2026',
        likesCount: 24,
      },
      {
        id: 'p-2',
        url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
        caption: 'Tiệc mừng ngọt ngào và văn nghệ huynh đệ tại sảnh sinh hoạt',
        uploadedBy: 'Minh Tuấn',
        date: '04/10/2026',
        likesCount: 19,
      },
      {
        id: 'p-3',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        caption: 'Ảnh lưu niệm toàn thể anh em Lưu Xá niên khóa 2026-2027',
        uploadedBy: 'Hoàng Long',
        date: '04/10/2026',
        likesCount: 31,
      },
    ],
    author: 'Trần Văn Đức',
    authorRole: 'Trưởng nhà',
    tags: ['#BonMangPhanxico', '#PaxEtBonum', '#NienKhoa2026'],
    isFeatured: true,
    participants: ['Trần Văn Đức', 'Minh Tuấn', 'Lê Hoàng Long', 'Phạm Gia Bảo', 'Vũ Quốc Việt', 'Đặng Thanh Phong', 'Bùi Văn Hiếu'],
    likesCount: 42,
    isLiked: true,
  },
  {
    id: 'alb-2026-2',
    title: 'Hành Hương Năm Thánh – Linh Địa Đức Mẹ La Vang & Trà Kiệu',
    description: 'Chuyến hành hương 3 ngày 2 đêm của đại gia đình Lưu Xá về bên Mẹ La Vang (Quảng Trị), dâng lên Mẹ năm học mới và cầu nguyện cho hòa bình gia đình.',
    category: 'Hành hương',
    date: '15/07/2026',
    year: 2026,
    month: 7,
    location: 'Linh địa Đức Mẹ La Vang, Hải Lăng, Quảng Trị',
    coverPhoto: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-4',
        url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
        caption: 'Toàn cảnh linh đài Đức Mẹ La Vang trong nắng sớm',
        uploadedBy: 'Gia Bảo',
        date: '15/07/2026',
        likesCount: 28,
      },
      {
        id: 'p-5',
        url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        caption: 'Giờ lần hạt Mân Côi tạ ơn lúc hoàng hôn buông xuống',
        uploadedBy: 'Minh Tuấn',
        date: '16/07/2026',
        likesCount: 22,
      },
      {
        id: 'p-6',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        caption: 'Ghé thăm phố cổ Hội An và giao lưu cùng sinh viên Công giáo miền Trung',
        uploadedBy: 'Đình Khôi',
        date: '17/07/2026',
        likesCount: 25,
      },
    ],
    author: 'Minh Tuấn',
    authorRole: 'Phó nhà',
    tags: ['#HanhHuongLaVang', '#MeLaVang', '#MuaHe2026'],
    isFeatured: true,
    participants: ['Minh Tuấn', 'Hoàng Long', 'Đình Khôi', 'Anh Khoa', 'Bảo Nam', 'Hữu Phước'],
    likesCount: 38,
    isLiked: false,
  },
  {
    id: 'alb-2026-3',
    title: 'Dã Ngoại Biển Vũng Tàu – Tĩnh Tâm & Gắn Kết Tình Huynh Đệ',
    description: 'Chuyến dã ngoại nạp năng lượng sau kỳ thi học kỳ 2: leo tượng Chúa Kitô Vua, tắm biển Bãi Sau và đốt lửa trại giao lưu huynh đệ.',
    category: 'Dã ngoại & Du lịch',
    date: '20/05/2026',
    year: 2026,
    month: 5,
    location: 'Bãi Sau & Núi Nhỏ, TP. Vũng Tàu',
    coverPhoto: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-7',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        caption: 'Bình minh rạng rỡ trên bãi biển Vũng Tàu',
        uploadedBy: 'Văn Hiếu',
        date: '20/05/2026',
        likesCount: 18,
      },
      {
        id: 'p-8',
        url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80',
        caption: 'Chinh phục 847 bậc thang lên Tượng Chúa Kitô dang tay',
        uploadedBy: 'Quốc Việt',
        date: '20/05/2026',
        likesCount: 27,
      },
      {
        id: 'p-9',
        url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
        caption: 'Tiệc nướng BBQ hải sản và hát thánh ca bên bờ sóng',
        uploadedBy: 'Tuấn Kiệt',
        date: '20/05/2026',
        likesCount: 30,
      },
    ],
    author: 'Lê Hoàng Long',
    authorRole: 'Phó nhà',
    tags: ['#VungTauTrip', '#ChuaKitoVua', '#HuynhDeGiaDinh'],
    participants: ['Lê Hoàng Long', 'Văn Hiếu', 'Tuấn Kiệt', 'Đình Khôi', 'Anh Khoa', 'Quốc Việt'],
    likesCount: 35,
    isLiked: true,
  },
  {
    id: 'alb-2026-4',
    title: 'Gia Đình Lưu Xá: Giờ Cơm Huynh Đệ & Trực Bếp Cuối Tuần',
    description: 'Những khoảnh khắc dung dị mỗi ngày bên nồi canh chua, đĩa cá kho và tiếng cười giòn tan của anh em sinh viên sau một ngày học tập miệt mài.',
    category: 'Bữa cơm huynh đệ',
    date: '18/09/2026',
    year: 2026,
    month: 9,
    location: 'Gian Bếp & Phòng Ăn Lưu Xá',
    coverPhoto: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-10',
        url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
        caption: 'Bữa cơm tối đầm ấm đầy đủ anh em trong nhà',
        uploadedBy: 'Gia Bảo',
        date: '18/09/2026',
        likesCount: 33,
      },
      {
        id: 'p-11',
        url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80',
        caption: 'Đội trực bếp sáng sớm đi chợ rau củ tươi ngon',
        uploadedBy: 'Thanh Phong',
        date: '18/09/2026',
        likesCount: 16,
      },
    ],
    author: 'Phạm Gia Bảo',
    authorRole: 'Thủ quỹ & Bếp',
    tags: ['#ComHuynhDe', '#BepPhanxico', '#YeuThuongPhucVu'],
    participants: ['Phạm Gia Bảo', 'Đặng Thanh Phong', 'Bùi Văn Hiếu', 'Trần Văn Đức'],
    likesCount: 29,
    isLiked: false,
  },
  {
    id: 'alb-2025-1',
    title: 'Lễ Tri Ân & Chia Tay Anh Em Cựu Sinh Viên Tốt Nghiệp Khóa 2021-2025',
    description: 'Đêm lửa trại xúc động và lời chúc lành tiễn 4 người anh lớn tốt nghiệp đại học, chính thức bước vào hành trình phụng sự xã hội và Giáo hội.',
    category: 'Chia tay & Tốt nghiệp',
    date: '28/06/2025',
    year: 2025,
    month: 6,
    location: 'Sân thượng Lưu Xá Phanxicô',
    coverPhoto: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-12',
        url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        caption: 'Trao quà lưu niệm và chụp hình kỷ yếu chúc mừng tân kỹ sư, cử nhân',
        uploadedBy: 'Quốc Việt',
        date: '28/06/2025',
        likesCount: 45,
      },
    ],
    author: 'Vũ Quốc Việt',
    authorRole: 'Admin',
    tags: ['#TotNghiep2025', '#CuuSinhVien', '#TriAn'],
    participants: ['Vũ Quốc Việt', 'Trần Văn Đức', 'Minh Tuấn', 'Hoàng Long'],
    likesCount: 48,
    isLiked: true,
  },
  {
    id: 'alb-2025-2',
    title: 'Hành Hương Đền Thánh Mẹ Tà Pao – Nguyện Cầu Ơn Bình An',
    description: 'Đoàn hành hương hiệp thông cầu nguyện cho quý vị phụ huynh, ân nhân và kỳ thi tốt nghiệp của các thành viên lưu xá.',
    category: 'Hành hương',
    date: '12/04/2025',
    year: 2025,
    month: 4,
    location: 'Trung tâm Thánh Mẫu Tà Pao, Tánh Linh, Bình Thuận',
    coverPhoto: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-13',
        url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1200&q=80',
        caption: 'Dâng hương và kinh cầu trước linh đài Mẹ Tà Pao',
        uploadedBy: 'Hữu Phước',
        date: '12/04/2025',
        likesCount: 34,
      },
    ],
    author: 'Trần Văn Đức',
    authorRole: 'Trưởng nhà',
    tags: ['#TaPao', '#MeTaPao', '#BinhThuan2025'],
    participants: ['Trần Văn Đức', 'Hữu Phước', 'Bảo Nam', 'Tuấn Kiệt'],
    likesCount: 37,
    isLiked: false,
  },
  {
    id: 'alb-2024-1',
    title: 'Kỳ Tĩnh Tâm Đầu Năm Học & Ngày Hội Thể Thao Huynh Đệ',
    description: 'Chương trình định hướng nội quy, chia sẻ đời sống cầu nguyện và các trận cầu thể thao kịch tính chào đón tân sinh viên nhập lưu xá.',
    category: 'Sinh hoạt thường nhật',
    date: '15/09/2024',
    year: 2024,
    month: 9,
    location: 'Khuôn viên Tu viện Thánh Phanxicô Thủ Đức',
    coverPhoto: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        id: 'p-14',
        url: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1200&q=80',
        caption: 'Trận bóng đá giao hữu giữa tân sinh viên và cựu sinh viên',
        uploadedBy: 'Đình Khôi',
        date: '15/09/2024',
        likesCount: 26,
      },
    ],
    author: 'Lê Hoàng Long',
    authorRole: 'Phó nhà',
    tags: ['#TheThao', '#TinhTam2024', '#TanSinhVien'],
    participants: ['Lê Hoàng Long', 'Đình Khôi', 'Văn Hiếu', 'Minh Tuấn'],
    likesCount: 31,
    isLiked: false,
  },
];

// ==========================================
// ACADEMIC & GPA MANAGEMENT (QUẢN LÝ HỌC TẬP)
// ==========================================

export interface SubjectScore {
  id: string;
  subjectName: string;
  credits: number;
  midtermScore: number; // Điểm giữa kỳ (thang 10)
  finalScore: number; // Điểm cuối kỳ (thang 10)
  totalScore: number; // Điểm tổng kết hệ 10
  letterGrade: string; // A+, A, B+, B, C+, C, D, F
}

export interface AcademicRecord {
  id: string;
  memberId: string;
  memberName: string;
  room: string;
  university: string;
  major: string;
  studentId: string; // Mã số sinh viên
  academicYear: string; // Niên khóa: "2025-2026", "2026-2027"
  semester: "Học kỳ 1" | "Học kỳ 2" | "Học kỳ hè";
  gpa10: number; // Điểm trung bình hệ 10
  gpa4: number; // Điểm trung bình hệ 4
  rank: "Xuất sắc" | "Giỏi" | "Khá" | "Trung bình" | "Cần cố gắng";
  subjects: SubjectScore[];
  evidencePhoto?: string; // Ảnh minh chứng bảng điểm (EVD)
  aspirations: string; // Nguyện vọng / Mục tiêu học tập / Khó khăn cần hỗ trợ
  scholarshipEligible?: boolean; // Đạt học bổng khuyến khích
  supportNeeded?: boolean; // Cần anh lớn phụ đạo / kèm cặp
  supportSubject?: string; // Môn học cần hỗ trợ
  updatedAt: string;
}

export const INITIAL_ACADEMIC_RECORDS: AcademicRecord[] = [
  {
    id: "acad-1",
    memberId: "m1",
    memberName: "Trần Văn Đức",
    room: "P.201",
    university: "ĐH Bách Khoa TP.HCM (HCMUT)",
    major: "Kỹ thuật Cơ điện tử",
    studentId: "2210842",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 8.65,
    gpa4: 3.62,
    rank: "Giỏi",
    subjects: [
      { id: "sub-1", subjectName: "Điều khiển tự động", credits: 3, midtermScore: 8.5, finalScore: 9.0, totalScore: 8.8, letterGrade: "A" },
      { id: "sub-2", subjectName: "Vi điều khiển & PLC", credits: 4, midtermScore: 8.0, finalScore: 8.5, totalScore: 8.3, letterGrade: "B+" },
      { id: "sub-3", subjectName: "Thiết kế hệ thống Cơ điện tử", credits: 3, midtermScore: 9.0, finalScore: 8.5, totalScore: 8.7, letterGrade: "A" },
      { id: "sub-4", subjectName: "Anh văn chuyên ngành 2", credits: 2, midtermScore: 8.5, finalScore: 9.0, totalScore: 8.8, letterGrade: "A" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Đặt mục tiêu duy trì học bổng khuyến khích học tập kỳ tới. Sẵn sàng phụ đạo môn Vật lý đại cương cho các em khóa dưới trong lưu xá.",
    scholarshipEligible: true,
    supportNeeded: false,
    updatedAt: "28/09/2026",
  },
  {
    id: "acad-2",
    memberId: "m2",
    memberName: "Minh Tuấn",
    room: "P.204",
    university: "ĐH Khoa học Tự nhiên (HCMUS)",
    major: "Khoa học Máy tính & AI",
    studentId: "2312015",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 9.15,
    gpa4: 3.85,
    rank: "Xuất sắc",
    subjects: [
      { id: "sub-21", subjectName: "Học máy & Nhận dạng mẫu", credits: 4, midtermScore: 9.5, finalScore: 9.0, totalScore: 9.2, letterGrade: "A+" },
      { id: "sub-22", subjectName: "Thuật toán nâng cao", credits: 3, midtermScore: 9.0, finalScore: 9.5, totalScore: 9.3, letterGrade: "A+" },
      { id: "sub-23", subjectName: "Thị giác máy tính (Computer Vision)", credits: 3, midtermScore: 8.5, finalScore: 9.0, totalScore: 8.8, letterGrade: "A" },
      { id: "sub-24", subjectName: "Kiến trúc máy tính", credits: 3, midtermScore: 9.0, finalScore: 9.0, totalScore: 9.0, letterGrade: "A+" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Duy trì vị trí Top 5 của khoa. Có nguyện vọng mở lớp phụ đạo Tin học văn phòng & Lập trình căn bản cho anh em lưu xá vào tối thứ Ba hàng tuần.",
    scholarshipEligible: true,
    supportNeeded: false,
    updatedAt: "29/09/2026",
  },
  {
    id: "acad-3",
    memberId: "m3",
    memberName: "Lê Hoàng Long",
    room: "P.202",
    university: "ĐH Sư phạm Kỹ thuật (HCMUTE)",
    major: "Kỹ thuật Ô tô",
    studentId: "2214509",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 7.85,
    gpa4: 3.20,
    rank: "Khá",
    subjects: [
      { id: "sub-31", subjectName: "Động cơ đốt trong", credits: 3, midtermScore: 7.5, finalScore: 8.0, totalScore: 7.8, letterGrade: "B" },
      { id: "sub-32", subjectName: "Hệ thống điện tử trên ô tô", credits: 3, midtermScore: 8.0, finalScore: 8.5, totalScore: 8.3, letterGrade: "B+" },
      { id: "sub-33", subjectName: "Truyền động thủy khí", credits: 3, midtermScore: 7.0, finalScore: 7.5, totalScore: 7.3, letterGrade: "B" },
      { id: "sub-34", subjectName: "Thực tập xưởng động lực", credits: 2, midtermScore: 8.5, finalScore: 8.0, totalScore: 8.2, letterGrade: "B+" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Học kỳ tới cần cố gắng nâng điểm môn Truyền động để đạt bằng Khá loại ưu. Nguyện vọng thi chứng chỉ TOEIC đạt 650 điểm.",
    scholarshipEligible: false,
    supportNeeded: false,
    updatedAt: "25/09/2026",
  },
  {
    id: "acad-4",
    memberId: "m4",
    memberName: "Phạm Gia Bảo",
    room: "P.301",
    university: "ĐH Y Dược TP.HCM (UMP)",
    major: "Y đa khoa (Năm 3)",
    studentId: "2351088",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 8.30,
    gpa4: 3.45,
    rank: "Giỏi",
    subjects: [
      { id: "sub-41", subjectName: "Giải phẫu bệnh", credits: 4, midtermScore: 8.5, finalScore: 8.0, totalScore: 8.2, letterGrade: "B+" },
      { id: "sub-42", subjectName: "Dược lý học đại cương", credits: 3, midtermScore: 8.0, finalScore: 8.5, totalScore: 8.3, letterGrade: "B+" },
      { id: "sub-43", subjectName: "Triệu chứng học Nội khoa", credits: 4, midtermScore: 8.5, finalScore: 8.5, totalScore: 8.5, letterGrade: "A" },
      { id: "sub-44", subjectName: "Thực tập lâm sàng Bệnh viện Chợ Rẫy", credits: 3, midtermScore: 9.0, finalScore: 8.5, totalScore: 8.7, letterGrade: "A" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Lịch trực viện dày đặc, mong ban ẩm thực lưu xá hỗ trợ lưu phần cơm trưa/tối khi về muộn. Dự định tham gia đội y tế tình nguyện của lưu xá.",
    scholarshipEligible: true,
    supportNeeded: false,
    updatedAt: "26/09/2026",
  },
  {
    id: "acad-5",
    memberId: "m5",
    memberName: "Vũ Quốc Việt",
    room: "P.102",
    university: "ĐH Kinh tế TP.HCM (UEH)",
    major: "Tài chính - Ngân hàng",
    studentId: "2380124",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 8.10,
    gpa4: 3.35,
    rank: "Giỏi",
    subjects: [
      { id: "sub-51", subjectName: "Kinh tế lượng", credits: 3, midtermScore: 8.0, finalScore: 8.5, totalScore: 8.3, letterGrade: "B+" },
      { id: "sub-52", subjectName: "Thị trường tài chính & Các định chế", credits: 3, midtermScore: 8.5, finalScore: 8.0, totalScore: 8.2, letterGrade: "B+" },
      { id: "sub-53", subjectName: "Quản trị rủi ro tài chính", credits: 3, midtermScore: 7.5, finalScore: 8.5, totalScore: 8.1, letterGrade: "B+" },
      { id: "sub-54", subjectName: "Thẩm định dự án đầu tư", credits: 3, midtermScore: 8.5, finalScore: 8.0, totalScore: 8.2, letterGrade: "B+" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Cần cải thiện môn Kinh tế lượng phần mềm Stata. Đang hỗ trợ anh Thủ quỹ lưu xá đối soát bảng thu chi hàng tháng.",
    scholarshipEligible: false,
    supportNeeded: false,
    updatedAt: "27/09/2026",
  },
  {
    id: "acad-6",
    memberId: "m6",
    memberName: "Đặng Thanh Phong",
    room: "P.203",
    university: "ĐH Công nghệ Thông tin (UIT)",
    major: "An toàn Thông tin",
    studentId: "2452099",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 6.85,
    gpa4: 2.65,
    rank: "Trung bình",
    subjects: [
      { id: "sub-61", subjectName: "Giải tích 2", credits: 4, midtermScore: 5.5, finalScore: 6.0, totalScore: 5.8, letterGrade: "C" },
      { id: "sub-62", subjectName: "Cấu trúc dữ liệu & Giải thuật", credits: 4, midtermScore: 7.0, finalScore: 7.5, totalScore: 7.3, letterGrade: "B" },
      { id: "sub-63", subjectName: "Mạng máy tính căn bản", credits: 3, midtermScore: 7.5, finalScore: 7.5, totalScore: 7.5, letterGrade: "B" },
      { id: "sub-64", subjectName: "Đại số tuyến tính", credits: 3, midtermScore: 6.0, finalScore: 6.5, totalScore: 6.3, letterGrade: "C+" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Gặp khó khăn lớn ở các môn Toán đại cương (Giải tích 2 và Đại số tuyến tính). Rất mong được anh Minh Tuấn hoặc anh Văn Đức kèm cặp vào tối thứ Năm.",
    scholarshipEligible: false,
    supportNeeded: true,
    supportSubject: "Giải tích 2 & Đại số tuyến tính",
    updatedAt: "28/09/2026",
  },
  {
    id: "acad-7",
    memberId: "m7",
    memberName: "Bùi Văn Hiếu",
    room: "P.302",
    university: "ĐH Kiến Trúc TP.HCM (UAH)",
    major: "Kiến trúc Công trình",
    studentId: "2251022",
    academicYear: "2025-2026",
    semester: "Học kỳ 2",
    gpa10: 8.40,
    gpa4: 3.50,
    rank: "Giỏi",
    subjects: [
      { id: "sub-71", subjectName: "Đồ án Kiến trúc Dân dụng 2", credits: 5, midtermScore: 8.5, finalScore: 9.0, totalScore: 8.8, letterGrade: "A" },
      { id: "sub-72", subjectName: "Vật lý kiến trúc & Chiếu sáng", credits: 3, midtermScore: 8.0, finalScore: 8.0, totalScore: 8.0, letterGrade: "B+" },
      { id: "sub-73", subjectName: "Lịch sử Kiến trúc phương Tây", credits: 2, midtermScore: 8.5, finalScore: 8.5, totalScore: 8.5, letterGrade: "A" },
      { id: "sub-74", subjectName: "Kết cấu công trình 1", credits: 3, midtermScore: 7.5, finalScore: 8.0, totalScore: 7.8, letterGrade: "B" },
    ],
    evidencePhoto: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80",
    aspirations: "Đồ án kỳ này nhận được lời khen của hội đồng. Dự định làm đồ án tốt nghiệp thiết kế trung tâm mục vụ công giáo.",
    scholarshipEligible: true,
    supportNeeded: false,
    updatedAt: "30/09/2026",
  },
];

export interface CleaningDuty {
  id: string;
  dayOfWeek: "Thứ Hai" | "Thứ Ba" | "Thứ Tư" | "Thứ Năm" | "Thứ Sáu" | "Thứ Bảy" | "Chúa Nhật";
  dateStr: string;
  area: string;
  areaIcon: string;
  assignedRoom: string;
  assignedMembers: string[];
  shift: "Ca Sáng (06:30)" | "Ca Chiều (17:30)" | "Ca Tối (21:00)";
  status: "pending" | "submitted" | "approved" | "rejected";
  checkInTime?: string;
  checkInBy?: string;
  checkInNote?: string;
  evidencePhoto?: string;
  reviewerName?: string;
  reviewNote?: string;
  reviewedAt?: string;
}

export const INITIAL_CLEANING_DUTIES: CleaningDuty[] = [
  {
    id: "duty-1",
    dayOfWeek: "Thứ Sáu",
    dateStr: "02/10/2026",
    area: "WC & Phòng tắm Tầng 1 - 2",
    areaIcon: "🚿",
    assignedRoom: "Phòng 201",
    assignedMembers: ["Trần Văn Đức", "Minh Tuấn"],
    shift: "Ca Sáng (06:30)",
    status: "approved",
    checkInTime: "07:10",
    checkInBy: "Trần Văn Đức",
    checkInNote: "Đã cọ sạch sàn WC, bồn rửa mặt, lau gương và thay túi rác mới.",
    evidencePhoto: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
    reviewerName: "Lê Hoàng Long (Phó nhà)",
    reviewNote: "Rất sạch sẽ, thơm tho, có lau khô sàn.",
    reviewedAt: "07:35",
  },
  {
    id: "duty-2",
    dayOfWeek: "Thứ Sáu",
    dateStr: "02/10/2026",
    area: "Cầu thang bộ & Hành lang các tầng",
    areaIcon: "🪜",
    assignedRoom: "Phòng 202",
    assignedMembers: ["Lê Hoàng Long", "Phạm Gia Bảo"],
    shift: "Ca Sáng (06:30)",
    status: "submitted",
    checkInTime: "07:25",
    checkInBy: "Phạm Gia Bảo",
    checkInNote: "Đã quét và lau cầu thang từ Tầng 4 xuống Tầng 1, lau tay vịn gỗ.",
    evidencePhoto: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "duty-3",
    dayOfWeek: "Thứ Sáu",
    dateStr: "02/10/2026",
    area: "Gian Bếp & Khu Bàn Ăn Chung",
    areaIcon: "🍳",
    assignedRoom: "Phòng 203",
    assignedMembers: ["Vũ Quốc Việt", "Đặng Thanh Phong"],
    shift: "Ca Chiều (17:30)",
    status: "pending",
  },
  {
    id: "duty-4",
    dayOfWeek: "Thứ Sáu",
    dateStr: "02/10/2026",
    area: "Nguyện Đường Assisi & Phòng SHC",
    areaIcon: "⛪",
    assignedRoom: "Phòng 301",
    assignedMembers: ["Bùi Văn Hiếu", "Hoàng Nam"],
    shift: "Ca Tối (21:00)",
    status: "pending",
  },
  {
    id: "duty-5",
    dayOfWeek: "Thứ Sáu",
    dateStr: "02/10/2026",
    area: "Sân Thượng, Sân Phơi & Gom Rác",
    areaIcon: "🌱",
    assignedRoom: "Phòng 302",
    assignedMembers: ["Đỗ Tuấn Kiệt", "Phan Bảo Nam"],
    shift: "Ca Chiều (17:30)",
    status: "pending",
  },
  {
    id: "duty-6",
    dayOfWeek: "Thứ Năm",
    dateStr: "01/10/2026",
    area: "WC & Phòng tắm Tầng 3 - 4",
    areaIcon: "🚿",
    assignedRoom: "Phòng 204",
    assignedMembers: ["Nguyễn Đình Khôi", "Trần Văn An"],
    shift: "Ca Sáng (06:30)",
    status: "approved",
    checkInTime: "07:05",
    checkInBy: "Nguyễn Đình Khôi",
    checkInNote: "Đã cọ sạch bồn cầu, sàn gạch và bổ sung xà phòng rửa tay.",
    evidencePhoto: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
    reviewerName: "Trần Văn Đức (Trưởng nhà)",
    reviewNote: "Đạt chuẩn vệ sinh quy định.",
    reviewedAt: "08:00",
  },
  {
    id: "duty-7",
    dayOfWeek: "Thứ Bảy",
    dateStr: "03/10/2026",
    area: "Tổng Vệ Sinh Cuối Tuần Toàn Nhà",
    areaIcon: "✨",
    assignedRoom: "Toàn thể lưu xá",
    assignedMembers: ["Tất cả thành viên"],
    shift: "Ca Sáng (06:30)",
    status: "pending",
  },
  {
    id: "duty-8",
    dayOfWeek: "Chúa Nhật",
    dateStr: "04/10/2026",
    area: "Nguyện Đường & Chuẩn bị Bàn Tiệc",
    areaIcon: "🕊️",
    assignedRoom: "Phòng 201 - 202",
    assignedMembers: ["Trần Văn Đức", "Lê Hoàng Long", "Phạm Gia Bảo"],
    shift: "Ca Sáng (06:30)",
    status: "pending",
  },
];



