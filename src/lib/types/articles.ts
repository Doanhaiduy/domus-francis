// Bài viết công khai (người ngoài xem được) — DTO dùng chung client/server.

export type ArticleStatus = "draft" | "published";

export interface ArticleCategoryInfo {
  code: string;
  label: string;
  description: string;
}

/** Chuyên mục cố định của bài viết công khai (cột public_articles.category lưu `code`). */
export const ARTICLE_CATEGORIES: ArticleCategoryInfo[] = [
  { code: "tuyen-sinh", label: "Tuyển sinh", description: "Thông tin đăng ký vào ở, điều kiện, hồ sơ và mùa tuyển sinh" },
  { code: "tin-tuc", label: "Tin tức", description: "Tin mới từ cộng đoàn lưu xá" },
  { code: "hoat-dong", label: "Hoạt động", description: "Sinh hoạt, lễ nghi, sự kiện và những khoảnh khắc đáng nhớ" },
  { code: "chia-se", label: "Chia sẻ", description: "Tâm tình, kinh nghiệm và câu chuyện của anh em" },
  { code: "thong-bao", label: "Thông báo", description: "Thông báo chính thức gửi đến mọi người" },
];

export const articleCategoryLabel = (code: string): string => ARTICLE_CATEGORIES.find((c) => c.code === code)?.label ?? "Tin tức";

/** Một bài trong danh sách (công khai hoặc trang quản lý). */
export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  /** Mã tệp ảnh bìa (storage_files.id); URL công khai dựng bằng publicFileUrl() */
  coverFileId: string | null;
  byline: string | null;
  isFeatured: boolean;
  status: ArticleStatus;
  /** Thẻ (tối đa 8) */
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
  views: number;
  readMinutes: number;
}

export interface ArticleDetail extends ArticleListItem {
  content: string;
}

export interface PublicArticleListDto {
  articles: ArticleListItem[];
  /** Số bài khớp bộ lọc (để phân trang) */
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicOrgInfo {
  /** Giới thiệu (Markdown) ở /gioi-thieu */
  about: string | null;
  /** "DD/MM" */
  patronFeast: string | null;
  houseName: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  orderName: string | null;
  patronName: string | null;
}

/** Một bản cũ của bài (lịch sử chỉnh sửa). */
export interface ArticleRevision {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  createdAt: string;
  savedByName: string | null;
}

/** Bài đã đăng nhưng hẹn giờ tương lai. */
export const isScheduled = (a: Pick<ArticleListItem, "status" | "publishedAt">) => a.status === "published" && !!a.publishedAt && new Date(a.publishedAt).getTime() > Date.now();
