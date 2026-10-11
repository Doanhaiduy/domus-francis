// DTO phân hệ Khoảnh khắc (album ảnh) — dùng chung client/server

export type MomentContentStatus = "published" | "hidden" | "locked";
export type MomentTagStatus = "pending" | "accepted" | "declined";

export interface MomentCategoryDto {
  id: string;
  code: string; // ALB_PILGRIM, ALB_TRIP, …
  name: string; // "Hành hương", …
  color: string;
}

export interface MomentPersonDto {
  memberId: string | null;
  name: string; // display_name
  fullName: string;
  /** Chức danh hiện hành (v_member_current_position) hoặc "Thành viên" */
  role: string;
  avatarUrl?: string;
}

/** Thẻ tên thành viên trong album (album_member_tags) — pending chỉ hiện với người gắn/người được gắn/người kiểm duyệt (RLS). */
export interface MomentParticipantDto {
  memberId: string;
  name: string;
  fullName: string;
  status: MomentTagStatus;
  isMe: boolean;
}

export interface MomentAlbumDto {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryCode: string;
  category: string;
  categoryColor: string;
  takenOn: string; // YYYY-MM-DD
  date: string; // DD/MM/YYYY
  year: number;
  month: number;
  location: string;
  /** Ảnh bìa: albums.cover_file_id, nếu trống lấy ảnh đầu tiên của album */
  coverFileId: string | null;
  coverUrl: string | null; // ?v=medium
  coverThumbUrl: string | null; // ?v=thumb
  author: MomentPersonDto;
  tags: string[]; // đã kèm dấu #
  participants: MomentParticipantDto[];
  photosCount: number;
  /** Số video đang hiển thị trong album */
  videosCount: number;
  /** Album chung của cả nhà (Khoảnh khắc thường ngày): mọi thành viên tự thêm ảnh / video */
  isShared: boolean;
  likesCount: number;
  isLiked: boolean;
  isFeatured: boolean;
  /** Hiện ở trang công khai /thu-vien (người chưa đăng nhập xem được) */
  isPublic: boolean;
  status: MomentContentStatus;
  visibility: "community" | "leadership" | "private";
  isMine: boolean;
  /** Tác giả hoặc người có quyền album.moderate */
  canEdit: boolean;
  canDelete: boolean;
  canAddPhotos: boolean;
  createdAt: string;
}

export interface MomentPhotoDto {
  id: string;
  albumId: string;
  fileId: string;
  url: string; // ?v=medium
  thumbUrl: string; // ?v=thumb
  originalUrl: string;
  downloadUrl: string; // ?download=1
  caption: string;
  uploadedBy: MomentPersonDto;
  date: string; // DD/MM/YYYY (thời điểm chụp nếu có, không thì lúc tải lên)
  width: number | null;
  height: number | null;
  likesCount: number;
  isLiked: boolean;
  sortOrder: number;
  status: MomentContentStatus;
  isMine: boolean;
  isCover: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Video của album. mp4 luôn có; hls chỉ có với Cloudinary (phát thích ứng băng thông, trình phát tự lùi về mp4 nếu lỗi). */
export interface MomentVideoDto {
  id: string;
  albumId: string;
  provider: "cloudinary" | "supabase" | "local";
  mp4Url: string;
  hlsUrl: string | null;
  /** Ảnh bìa (ảnh tự chụp khi tải lên, hoặc khung hình đầu do Cloudinary tạo) */
  posterUrl: string | null;
  caption: string;
  uploadedBy: MomentPersonDto;
  date: string; // DD/MM/YYYY
  durationMs: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  status: MomentContentStatus;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface MomentAlbumDetailDto extends MomentAlbumDto {
  photos: MomentPhotoDto[];
  videos: MomentVideoDto[];
}

/** Giới hạn tải video hiện hành (theo nơi lưu trữ đang dùng). */
export interface VideoLimitsDto {
  provider: "cloudinary" | "supabase" | "local";
  maxBytes: number;
  maxDurationS: number;
  mimes: string[];
}

/** Kết quả bước 1 tải video: địa chỉ + tham số để trình duyệt tải thẳng lên nơi lưu trữ. */
export interface VideoUploadInitDto {
  provider: "cloudinary" | "supabase" | "local";
  ticket: string;
  maxBytes: number;
  uploadUrl: string;
  method: "POST" | "PUT";
  fields: Record<string, string>;
  headers: Record<string, string>;
  fileField: string | null;
}

export interface MomentStatsDto {
  albums: number;
  photos: number;
  videos: number;
  likes: number;
  years: number[]; // giảm dần
}

export interface MomentListDto {
  albums: MomentAlbumDto[];
  /** Album tiêu biểu (is_featured mới nhất, nếu không có thì album mới nhất) — không phụ thuộc bộ lọc */
  featured: MomentAlbumDto | null;
  stats: MomentStatsDto;
  categories: MomentCategoryDto[];
  canModerate: boolean;
  /** Mã album chung "Khoảnh khắc thường ngày" (null nếu chưa ai mở lần nào — bấm vào thẻ sẽ tự tạo) */
  dailyAlbumId: string | null;
  videoLimits: VideoLimitsDto;
}

export interface MomentListFilter {
  category?: string; // categories.id
  year?: number;
  month?: number;
  day?: string; // "dd", "dd/mm", "dd/mm/yyyy"
  featured?: boolean;
  q?: string;
}

export interface MomentLikeResult {
  liked: boolean;
  likesCount: number;
}
