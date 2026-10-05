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
  likesCount: number;
  isLiked: boolean;
  isFeatured: boolean;
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

export interface MomentAlbumDetailDto extends MomentAlbumDto {
  photos: MomentPhotoDto[];
}

export interface MomentStatsDto {
  albums: number;
  photos: number;
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
