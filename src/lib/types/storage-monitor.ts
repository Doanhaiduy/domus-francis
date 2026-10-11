// DTO của trang "Dung lượng" (Cài đặt → chỉ Admin, quyền system.monitor). Số liệu CSDL/tệp lấy từ app.fn_storage_overview (db/app/1039);
// số đo Supabase Storage + Cloudinary lấy qua API của họ (src/server/modules/storage-monitor.ts) nên trả riêng, tải riêng.

export type FileKind = "image" | "video" | "pdf";
export type MonitorLevel = "ok" | "warn" | "critical" | "unknown";

export interface MonitorLimits {
  /** Hạn mức CSDL (byte) của gói Supabase */
  dbLimitBytes: number;
  /** Hạn mức Supabase Storage (byte) */
  storageLimitBytes: number;
  warnPercent: number;
  criticalPercent: number;
}

export interface KindStat {
  kind: FileKind;
  count: number;
  bytes: number;
}
export interface BucketStat {
  bucket: string;
  count: number;
  bytes: number;
}
export interface StoreStat {
  /** primary = kho tệp chính (Supabase Storage; ổ đĩa khi chạy thử) | cloudinary | supabase | local (nơi lưu video) */
  store: string;
  count: number;
  bytes: number;
}
export interface PeriodStat {
  key: "today" | "d7" | "d30" | "d90";
  images: number;
  videos: number;
  pdfs: number;
  bytes: number;
  /** Phần dung lượng nằm ở Supabase Storage / ổ đĩa (không tính video lưu ở Cloudinary) — dùng dự báo ngày đầy */
  storageBytes: number;
}
export interface DailyStat {
  /** YYYY-MM-DD (giờ Việt Nam) */
  day: string;
  images: number;
  videos: number;
  pdfs: number;
  bytes: number;
}
export interface MonthlyStat {
  /** YYYY-MM */
  month: string;
  images: number;
  videos: number;
  pdfs: number;
  bytes: number;
}
export interface UploaderStat {
  memberId: string | null;
  name: string;
  count: number;
  bytes: number;
}
export interface LargestFile {
  id: string;
  name: string | null;
  bucket: string;
  kind: FileKind;
  store: string;
  bytes: number;
  createdAt: string;
  uploader: string | null;
}
export interface TableStat {
  name: string;
  bytes: number;
  rows: number;
}
export interface SnapshotPoint {
  day: string;
  dbBytes: number;
  storageBytes: number | null;
  storageSource: "supabase" | "local" | "estimate" | null;
  filesBytes: number;
  videosBytes: number;
  cloudinaryCreditsUsed: number | null;
  cloudinaryCreditsLimit: number | null;
}

export interface StorageOverviewDto {
  generatedAt: string;
  days: number;
  limits: MonitorLimits;
  database: { sizeBytes: number; tables: TableStat[] };
  files: {
    totals: { count: number; bytes: number };
    byKind: KindStat[];
    byBucket: BucketStat[];
    byStore: StoreStat[];
    /** Tệp chưa xử lý xong / bị từ chối / cách ly quá 1 ngày — ứng viên để dọn */
    stale: { count: number; bytes: number };
    /** Số bản thu nhỏ (thumb/medium) sinh ra từ ảnh gốc — chiếm thêm dung lượng nhưng không nằm trong số "bytes" */
    variantCount: number;
  };
  periods: PeriodStat[];
  daily: DailyStat[];
  monthly: MonthlyStat[];
  topUploaders: UploaderStat[];
  largest: LargestFile[];
  history: SnapshotPoint[];
}

export interface SupabaseUsage {
  /** supabase = đếm thật qua Storage API; local = ổ đĩa (chạy thử); unavailable = không đo được */
  source: "supabase" | "local" | "unavailable";
  usedBytes: number | null;
  objects: number | null;
  buckets: { bucket: string; objects: number; bytes: number }[];
  error?: string;
}

export interface CloudinaryUsage {
  configured: boolean;
  ok: boolean;
  error?: string;
  plan: string | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  /** % credits đã dùng trong chu kỳ tính phí hiện tại */
  creditsPercent: number | null;
  storageBytes: number | null;
  bandwidthBytes: number | null;
  transformations: number | null;
  resources: number | null;
  lastUpdated: string | null;
}

export interface ProvidersDto {
  fetchedAt: string;
  cached: boolean;
  supabase: SupabaseUsage;
  cloudinary: CloudinaryUsage;
}
