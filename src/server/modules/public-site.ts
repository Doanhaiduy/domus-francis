import "server-only";
import { createHash } from "node:crypto";
import type { Tx } from "../db";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { hashKey } from "../ops";
import type {
  AdmissionInfo,
  AdmissionScheduleItem,
  DonationInfo,
  DonationTransparency,
  FaqDto,
  InquiryDto,
  InquiryStatus,
  PublicAlbumDetailDto,
  PublicAlbumDto,
} from "@/lib/types/public-site";
import { permissions } from "./community-shared";

// Dữ liệu cho trang công khai mở rộng + phần quản lý tương ứng. Truy vấn công khai chạy dưới luuxa_app KHÔNG có người dùng:
// RLS chỉ cho thấy dữ liệu công khai (câu hỏi đang bật, album is_public…).

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
type Row = Record<string, any>;

// ---------------------------------------------------------------------
// Hỏi đáp
// ---------------------------------------------------------------------
const toFaq = (r: Row): FaqDto => ({ id: r.id, question: r.question, answer: r.answer, sortOrder: Number(r.sort_order) || 0, isActive: !!r.is_active });

export async function listFaqs(tx: Tx, all = false): Promise<FaqDto[]> {
  if (all) await assertManage(tx);
  const rows = (await tx.query(`SELECT id, question, answer, sort_order, is_active FROM public_faqs ${all ? "" : "WHERE is_active"} ORDER BY sort_order, created_at`)).rows;
  return rows.map(toFaq);
}

async function assertManage(tx: Tx) {
  if (!(await permissions(tx, ["article.manage"] as const))["article.manage"]) throw forbidden("Bạn không có quyền quản lý nội dung công khai.");
}

export interface FaqInput {
  question: string;
  answer: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createFaq(tx: Tx, b: FaqInput): Promise<FaqDto> {
  await assertManage(tx);
  const max = (await tx.query<{ m: number | null }>("SELECT max(sort_order) AS m FROM public_faqs")).rows[0].m ?? 0;
  const r = (
    await tx.query("INSERT INTO public_faqs (question, answer, is_active, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, question, answer, sort_order, is_active", [b.question, b.answer, b.isActive ?? true, b.sortOrder ?? max + 1])
  ).rows[0];
  return toFaq(r);
}

export async function updateFaq(tx: Tx, id: string, b: Partial<FaqInput>): Promise<FaqDto> {
  await assertManage(tx);
  const cols: Record<string, string> = { question: "question", answer: "answer", isActive: "is_active", sortOrder: "sort_order" };
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [k, c] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[k];
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${c} = $${vals.length}`);
  }
  if (!sets.length) throw badRequest("Không có thay đổi nào.");
  const r = (await tx.query(`UPDATE public_faqs SET ${sets.join(", ")} WHERE id = $1 RETURNING id, question, answer, sort_order, is_active`, vals)).rows[0];
  if (!r) throw notFound("Không tìm thấy câu hỏi.");
  return toFaq(r);
}

export async function deleteFaq(tx: Tx, id: string) {
  await assertManage(tx);
  const r = await tx.query("DELETE FROM public_faqs WHERE id = $1", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy câu hỏi.");
}

// ---------------------------------------------------------------------
// Đăng ký tìm hiểu từ trang công khai
// ---------------------------------------------------------------------
export interface InquiryInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  school?: string | null;
  yearOfStudy?: string | null;
  parish?: string | null;
  message?: string | null;
  preferredVisit?: string | null;
}

/** Băm IP + muối theo ngày: đủ để giới hạn tốc độ nhưng không lưu IP thô. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${process.env.PII_BIDX_KEY ?? "luuxa"}`).digest("hex").slice(0, 32);
}

export async function submitInquiry(tx: Tx, b: InquiryInput, ip: string | null, userAgent: string | null): Promise<void> {
  try {
    await tx.query("SELECT app.fn_submit_admission_inquiry($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
      b.fullName,
      b.phone ?? null,
      b.email ?? null,
      b.school ?? null,
      b.yearOfStudy ?? null,
      b.parish ?? null,
      b.message ?? null,
      b.preferredVisit ?? null,
      hashIp(ip),
      userAgent,
    ]);
  } catch (e) {
    const msg = (e as { message?: string }).message ?? "";
    if (/^RATE_LIMITED:/.test(msg)) throw new ApiError(429, "RATE_LIMITED", msg.replace(/^RATE_LIMITED:\s*/, ""));
    throw e;
  }
}

const toInquiry = (r: Row): InquiryDto => ({
  id: r.id,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  school: r.school,
  yearOfStudy: r.year_of_study,
  parish: r.parish,
  message: r.message,
  preferredVisit: r.preferred_visit,
  status: r.status as InquiryStatus,
  note: r.note,
  createdAt: iso(r.created_at) ?? "",
  handledAt: iso(r.handled_at),
  handledByName: r.handled_by_name ?? null,
});

export async function listInquiries(tx: Tx): Promise<InquiryDto[]> {
  if (!(await permissions(tx, ["application.review"] as const))["application.review"]) throw forbidden("Chỉ người duyệt đơn xin vào nhà xem được danh sách này.");
  const rows = (
    await tx.query(
      `SELECT i.*, (SELECT m.display_name FROM members m WHERE m.user_id = i.handled_by LIMIT 1) AS handled_by_name
         FROM admission_inquiries i ORDER BY (i.status = 'new') DESC, i.created_at DESC LIMIT 300`
    )
  ).rows;
  return rows.map(toInquiry);
}

export async function updateInquiry(tx: Tx, id: string, b: { status?: InquiryStatus; note?: string | null }): Promise<void> {
  if (!(await permissions(tx, ["application.review"] as const))["application.review"]) throw forbidden("Chỉ người duyệt đơn xin vào nhà xử lý được đăng ký này.");
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (b.status !== undefined) {
    vals.push(b.status);
    sets.push(`status = $${vals.length}`);
  }
  if (b.note !== undefined) {
    vals.push(b.note?.trim() || null);
    sets.push(`note = $${vals.length}`);
  }
  if (!sets.length) throw badRequest("Không có thay đổi nào.");
  const r = await tx.query(`UPDATE admission_inquiries SET ${sets.join(", ")} WHERE id = $1`, vals);
  if (!r.rowCount) throw notFound("Không tìm thấy đăng ký này (hoặc bạn không có quyền xử lý).");
}

export async function countNewInquiries(tx: Tx): Promise<number> {
  return (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM admission_inquiries WHERE status = 'new'")).rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------
// Thư viện ảnh công khai
// ---------------------------------------------------------------------
const toAlbum = (r: Row): PublicAlbumDto => ({
  id: r.id,
  title: r.title,
  description: r.description,
  takenOn: String(r.taken_on).slice(0, 10),
  location: r.location_text,
  coverFileId: r.cover_file_id ?? r.first_file_id ?? null,
  photosCount: Number(r.photos_count) || 0,
});

export async function listPublicAlbums(tx: Tx, limit = 60): Promise<PublicAlbumDto[]> {
  const rows = (
    await tx.query(
      `SELECT a.id, a.title, a.description, a.taken_on, a.location_text, a.cover_file_id, a.photos_count,
              (SELECT p.file_id FROM album_photos p WHERE p.album_id = a.id AND p.status = 'published' AND p.deleted_at IS NULL ORDER BY p.sort_order, p.created_at LIMIT 1) AS first_file_id
         FROM albums a WHERE a.is_public AND a.status = 'published' AND a.deleted_at IS NULL
        ORDER BY a.taken_on DESC, a.created_at DESC LIMIT ${Math.min(limit, 100)}`
    )
  ).rows;
  return rows.map(toAlbum).filter((a) => a.photosCount > 0 || a.coverFileId);
}

export async function getPublicAlbum(tx: Tx, id: string): Promise<PublicAlbumDetailDto | null> {
  const a = (
    await tx.query(
      `SELECT a.id, a.title, a.description, a.taken_on, a.location_text, a.cover_file_id, a.photos_count
         FROM albums a WHERE a.id = $1 AND a.is_public AND a.status = 'published' AND a.deleted_at IS NULL`,
      [id]
    )
  ).rows[0];
  if (!a) return null;
  const photos = (
    await tx.query("SELECT id, file_id, caption FROM album_photos WHERE album_id = $1 AND status = 'published' AND deleted_at IS NULL ORDER BY sort_order, created_at LIMIT 300", [id])
  ).rows.map((p) => ({ id: p.id as string, fileId: p.file_id as string, caption: (p.caption as string | null) ?? null }));
  return { ...toAlbum({ ...a, first_file_id: photos[0]?.fileId }), photosCount: photos.length, photos };
}

// ---------------------------------------------------------------------
// Ủng hộ
// ---------------------------------------------------------------------
export async function getDonationInfo(tx: Tx): Promise<DonationInfo> {
  const j = ((await tx.query("SELECT app.fn_public_donation_info() AS j")).rows[0]?.j ?? { enabled: false }) as { enabled?: boolean; note?: string; account?: Record<string, unknown> | null };
  if (!j.enabled) return { enabled: false, note: "", account: null };
  const a = j.account ?? {};
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const account = s("accountNo") ? { bankBin: s("bankBin") || null, bankName: s("bankName"), accountNo: s("accountNo"), accountName: s("accountName") } : null;
  return { enabled: true, note: j.note ?? "", account };
}

export interface PublicDonationInput {
  /** Họ tên / danh xưng; trống ⇒ "Ẩn danh" */
  donorName?: string | null;
  amountVnd: number;
  /** YYYY-MM-DD */
  donatedOn: string;
  message?: string | null;
  contact?: string | null;
}

/**
 * Người ngoài báo "đã ủng hộ" (app.fn_public_donation_report): tạo khoản chờ Thủ quỹ xác nhận + báo Thủ quỹ/Trưởng nhà.
 * IP chỉ dùng dạng băm làm khóa giới hạn tần suất (3 lần/giờ) — không lưu IP thô.
 */
export async function reportPublicDonation(tx: Tx, b: PublicDonationInput, ip: string | null): Promise<string> {
  try {
    const r = await tx.query<{ id: string }>("SELECT app.fn_public_donation_report($1, $2, $3::date, $4, $5, $6) AS id", [
      b.donorName?.trim() || null,
      b.amountVnd,
      b.donatedOn,
      b.message?.trim() || null,
      b.contact?.trim() || null,
      ip ? hashKey("donation-public", ip) : null,
    ]);
    return r.rows[0].id;
  } catch (e) {
    const msg = (e as { message?: string }).message ?? "";
    if (/^RATE_LIMITED:/.test(msg)) throw new ApiError(429, "RATE_LIMITED", msg.replace(/^RATE_LIMITED:\s*/, ""));
    if (/^DONATION_DISABLED:/.test(msg)) throw new ApiError(404, "NOT_FOUND", "Trang ủng hộ đang tạm tắt.");
    throw e;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Minh bạch ủng hộ của một năm — chỉ khi người quản lý bật (org.donation_transparency) và trang Ủng hộ đang bật. */
export async function getDonationTransparency(tx: Tx, year?: number | null): Promise<DonationTransparency> {
  const j = ((await tx.query("SELECT app.fn_public_donation_transparency($1::int) AS j", [year ?? null])).rows[0]?.j ?? { enabled: false }) as Row;
  if (!j.enabled) return { enabled: false };
  const cats = Array.isArray(j.expenseByCategory) ? (j.expenseByCategory as Row[]) : [];
  return {
    enabled: true,
    year: num(j.year) ?? new Date().getFullYear(),
    years: (Array.isArray(j.years) ? (j.years as unknown[]) : []).map(num).filter((y): y is number => y !== null),
    donationCount: num(j.donationCount) ?? 0,
    donationTotalVnd: num(j.donationTotalVnd) ?? 0,
    expenseTotalVnd: num(j.expenseTotalVnd) ?? 0,
    expenseByCategory: cats.map((c) => ({ name: str(c.name) ?? "Khác", totalVnd: num(c.totalVnd) ?? 0 })).filter((c) => c.totalVnd > 0),
    asOf: str(j.asOf) ?? "",
  };
}

// ---------------------------------------------------------------------
// Trang "Vào ở lưu xá" (/vao-o)
// ---------------------------------------------------------------------
const HHMM = /(\d{1,2})\s*[:hg]\s*(\d{2})/gi;

/** Các mốc giờ "HH:MM" xuất hiện trong một chuỗi ("04:30 – 22:00", "cổng mở lúc 4h30"…). */
export function timesIn(s: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (s ?? "").matchAll(HHMM)) {
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h <= 23 && mi <= 59) out.push(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
  }
  return out;
}

const validTime = (v: unknown): string | null => timesIn(str(v))[0] ?? null;

/**
 * Nhịp sinh hoạt rút từ mục "Giờ giấc" của Luật nhà (văn bản CHÍNH THỨC): giờ mở/đóng cổng, giờ Kinh tối, giờ yên lặng.
 * Giờ Kinh tối trong cấu hình (liturgy.night_prayer_time — giờ mặc định khi lập lịch Kinh tối lặp lại) chỉ dùng khi Luật nhà không ghi,
 * để trang công khai không hiện hai giờ khác nhau cho cùng một việc.
 */
export function rhythmFromSchedule(items: AdmissionScheduleItem[], nightPrayerSetting: string | null) {
  let gateOpen: string | null = null;
  let gateClose: string | null = null;
  let nightPrayer: string | null = null;
  let quiet: string | null = null;
  for (const it of items) {
    if (it.note) continue;
    const ts = timesIn(it.time).length ? timesIn(it.time) : timesIn(it.text);
    if (!ts.length) continue;
    if (/cổng|giới nghiêm/i.test(it.text) && !gateOpen && !gateClose) {
      if (ts.length >= 2) [gateOpen, gateClose] = [ts[0], ts[1]];
      else if (/đóng/i.test(it.text)) gateClose = ts[0];
      else if (/mở/i.test(it.text)) gateOpen = ts[0];
    } else if (/kinh/i.test(it.text) && !nightPrayer) nightPrayer = ts[0];
    else if (/tắt đèn|yên lặng|giờ ngủ/i.test(it.text) && !quiet) quiet = ts[0];
  }
  return { gateOpen, gateClose, quietTime: quiet, nightPrayerTime: nightPrayer ?? validTime(nightPrayerSetting) };
}

export async function getAdmissionInfo(tx: Tx): Promise<AdmissionInfo> {
  const j = ((await tx.query("SELECT app.fn_public_admission_info() AS j")).rows[0]?.j ?? {}) as Row;
  const dues = (j.dues ?? {}) as Row;
  const plan = dues.currentPlan as Row | null | undefined;
  const util = j.utilities as Row | null | undefined;
  const vac = (j.vacancies ?? {}) as Row;
  const rh = (j.rhythm ?? {}) as Row;
  const sc = j.schedule as Row | null | undefined;
  const items: AdmissionScheduleItem[] =
    sc && Array.isArray(sc.items)
      ? (sc.items as Row[]).map((i) => ({ time: str(i.time), text: str(i.text) ?? "", note: i.note === true, sub: i.sub === true })).filter((i) => i.text)
      : [];
  const meals = rh.mealsEnabled === true;
  const planAmount = plan ? num(plan.amountVnd) : null;
  const utilAvg = util ? num(util.avgPerPersonVnd) : null;
  return {
    today: str(j.today) ?? new Date().toISOString().slice(0, 10),
    dues: {
      cycleAmountVnd: num(dues.cycleAmountVnd),
      cycleMonths: num(dues.cycleMonths),
      cycleStartMonth: num(dues.cycleStartMonth),
      cycleDueDay: num(dues.cycleDueDay),
      graduatedAmountVnd: num(dues.graduatedAmountVnd),
      currentPlan:
        plan && planAmount
          ? { name: str(plan.name) ?? "Quỹ sinh hoạt", amountVnd: planAmount, from: str(plan.from) ?? "", to: str(plan.to) ?? "", dueDate: str(plan.dueDate) ?? "" }
          : null,
    },
    utilities: util && utilAvg ? { avgPerPersonVnd: utilAvg, months: num(util.months) ?? 1, from: str(util.from) ?? "", to: str(util.to) ?? "" } : null,
    vacancies:
      vac.enabled === true
        ? { enabled: true, capacity: num(vac.capacity) ?? 0, residents: num(vac.residents) ?? 0, free: Math.max(0, num(vac.free) ?? 0) }
        : { enabled: false },
    rhythm: {
      ...rhythmFromSchedule(items, str(rh.nightPrayerTime)),
      mealsEnabled: meals,
      lunchCutoff: meals ? validTime(rh.lunchCutoff) : null,
      dinnerCutoff: meals ? validTime(rh.dinnerCutoff) : null,
    },
    schedule: sc && items.length ? { title: str(sc.title) ?? "Giờ giấc sinh hoạt", description: str(sc.description), items } : null,
  };
}

// ---------------------------------------------------------------------
// Biểu mẫu công khai: CAPTCHA Cloudflare Turnstile (tùy chọn) + chặn gửi chéo trang
// ---------------------------------------------------------------------
/** true nếu chưa bật CAPTCHA (chưa có TURNSTILE_SECRET_KEY) hoặc mã xác minh hợp lệ. */
export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Route công khai không dùng cookie CSRF ⇒ chặn yêu cầu gửi từ trang khác (Origin lạ) bằng 403. */
export function assertSameOrigin(headers: Headers): void {
  const origin = headers.get("origin");
  if (!origin) return;
  const host = headers.get("x-forwarded-host") || headers.get("host");
  let same = false;
  try {
    same = new URL(origin).host === host;
  } catch {
    same = false;
  }
  if (!same) throw forbidden("Yêu cầu bị chặn (Origin không hợp lệ).");
}
