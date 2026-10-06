import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { digitsOnly } from "../pii";
import { canonicalMajor } from "@/lib/majors";
import { permissions } from "./community-shared";
import { assignRoom } from "./house";
import { createMemberProfile, type MemberProfileInput } from "./members";

// Nhập hàng loạt thành viên từ bảng tính (Excel/CSV). Trình duyệt đọc tệp rồi gửi các dòng dạng JSON; máy chủ chuẩn hóa, kiểm tra từng dòng,
// phát hiện trùng (SĐT/email/CCCD với người đã có hoặc trùng trong tệp) và — khi xác nhận — tạo từng thành viên trong một điểm lưu riêng
// (một dòng lỗi không làm hỏng cả lô). Nhập được mọi thông tin hồ sơ trừ: thông tin Công giáo (tên thánh, giáo phận, giáo xứ, bí tích — cần chính
// thành viên đồng ý, không ghi thay), ảnh đại diện và tài khoản đăng nhập. Cột nào người nhập không có quyền ghi thì bị bỏ qua kèm thông báo.

export const IMPORT_MAX_ROWS = 300;
const cell = (max: number) => z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max)));

export const ImportRowSchema = z.object({
  fullName: cell(120),
  displayName: cell(60),
  gender: cell(20),
  birthDate: cell(30),
  phone: cell(30),
  email: cell(200),
  hidePhone: cell(20),
  joinedOn: cell(30),
  roomCode: cell(60),
  nationalId: cell(30),
  hometown: cell(200),
  homeAddress: cell(300),
  studentStatus: cell(60),
  universityName: cell(200),
  major: cell(200),
  academicYear: cell(60),
  enrollmentYear: cell(10),
  expectedGraduationYear: cell(10),
  studentCode: cell(30),
  fatherName: cell(120),
  fatherPhone: cell(30),
  motherName: cell(120),
  motherPhone: cell(30),
  customDuesVnd: cell(30),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const ImportSchema = z.object({
  rows: z.array(ImportRowSchema).min(1, "Tệp không có dòng nào.").max(IMPORT_MAX_ROWS, `Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} dòng.`),
  dryRun: z.boolean().optional(),
});

export interface ImportRowResult {
  /** Số dòng trong tệp (1 = dòng dữ liệu đầu tiên) */
  line: number;
  fullName: string;
  status: "ok" | "warning" | "error" | "created" | "failed";
  messages: string[];
}
export interface ImportResult {
  dryRun: boolean;
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  created: number;
  /** Lưu ý chung cho cả lô (vd. thiếu quyền ghi một nhóm cột ⇒ nhóm đó bị bỏ qua ở mọi dòng) */
  notices: string[];
  rows: ImportRowResult[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();

/** SĐT Việt Nam → E.164; chấp nhận thiếu số 0 đầu (Excel hay bỏ). null nếu không hợp lệ. */
export function cleanPhone(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  let e164: string;
  if (s.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("84") && digits.length >= 11) e164 = `+${digits}`;
  else if (digits.startsWith("0")) e164 = `+84${digits.slice(1)}`;
  else if (digits.length === 9) e164 = `+84${digits}`;
  else return null;
  return /^\+\d{9,15}$/.test(e164) ? e164 : null;
}

/** "31/12/2005", "5/3/2005", "2005-03-05" → "YYYY-MM-DD" (null nếu không hợp lệ). */
export function cleanDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cleanGender(raw: string): "Nam" | "Nữ" | null | undefined {
  const g = fold(raw);
  if (!g) return undefined;
  if (["nam", "male", "m", "trai"].includes(g)) return "Nam";
  if (["nu", "female", "f", "gai"].includes(g)) return "Nữ";
  return null;
}

type StudentStatus = "studying" | "graduated" | "suspended" | "dropped_out";

/** "Có/Không", "x", "1"… → boolean; undefined nếu để trống; null nếu không nhận ra. */
function cleanYesNo(raw: string): boolean | null | undefined {
  const v = fold(raw);
  if (!v) return undefined;
  if (["co", "x", "1", "true", "yes", "y", "an"].includes(v)) return true;
  if (["khong", "0", "false", "no", "n", "hien"].includes(v)) return false;
  return null;
}

/** CCCD (12 số) / CMND (9 số). Excel hay bỏ số 0 đầu (CCCD bắt đầu bằng mã tỉnh 0xx) ⇒ thiếu đúng một số thì tự thêm lại. null nếu không hợp lệ. */
export function cleanNationalId(raw: string): string | null {
  if (!/^[\d\s.-]+$/.test(raw)) return null;
  const d = digitsOnly(raw);
  if (d.length === 9 || d.length === 12) return d;
  if (d.length === 8 || d.length === 11) return `0${d}`;
  return null;
}

/** Năm 4 chữ số trong khoảng [min, max]; undefined nếu trống, null nếu sai. */
function cleanYear(raw: string, min: number, max: number): number | null | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})(?:[.,]0+)?$/.exec(raw);
  const y = m ? Number(m[1]) : NaN;
  return y >= min && y <= max ? y : null;
}

/** "300000", "300.000", "300,000 đ", "300k" → số đồng (0 … 50 triệu); undefined nếu trống, null nếu sai. */
export function cleanMoney(raw: string): number | null | undefined {
  const t = raw.toLowerCase().replace(/\s|vnđ|vnd|đ/g, "");
  if (!t) return undefined;
  let n: number;
  const k = /^(\d+)k$/.exec(t);
  if (k) n = Number(k[1]) * 1000;
  else if (/^\d+$|^\d{1,3}([.,]\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, ""));
  else return null;
  return n <= 50_000_000 ? n : null;
}

/** "Đang học", "Đã tốt nghiệp (Ra trường / Đi làm)", "Bảo lưu", "Thôi học" → mã; undefined nếu trống, null nếu không nhận ra. */
function cleanStudentStatus(raw: string): StudentStatus | null | undefined {
  const v = fold(raw);
  if (!v) return undefined;
  if (/tot nghiep|ra truong|di lam|graduated/.test(v)) return "graduated";
  if (/bao luu|suspended/.test(v)) return "suspended";
  if (/thoi hoc|nghi hoc|dropped/.test(v)) return "dropped_out";
  if (/dang hoc|sinh vien|studying/.test(v)) return "studying";
  return null;
}

/** Ngày vào nhà: đủ ngày ("15/09/2026") hoặc chỉ tháng/năm ("09/2026" ⇒ ngày 1). null nếu không hợp lệ. */
function cleanJoinedOn(raw: string): string | null {
  const full = cleanDate(raw);
  if (full) return full;
  let m: number, y: number;
  let r = /^(\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
  if (r) [m, y] = [+r[1], +r[2]];
  else if ((r = /^(\d{4})-(\d{1,2})$/.exec(raw.trim()))) [y, m] = [+r[1], +r[2]];
  else return null;
  return m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, "0")}-01` : null;
}

/** Thông báo thân thiện cho lỗi DB hay gặp khi ghi từng dòng. */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ux_member_private__nid_bidx")) return "Số CCCD/CMND này đã có ở một thành viên khác.";
  return msg;
}

interface Analyzed {
  line: number;
  fullName: string;
  errors: string[];
  warnings: string[];
  profile: MemberProfileInput & { fullName: string };
  roomCode: string | null;
}

/** Quyền của người nhập quyết định cột nào được ghi (RLS/trigger sẽ chặn nếu thiếu — ở đây bỏ qua có thông báo thay vì làm hỏng từng dòng). */
interface Caps {
  /** member.private.write: ngày sinh, quê quán, địa chỉ, CCCD, cha/mẹ */
  priv: boolean;
  /** member.update: mọi lệnh UPDATE hồ sơ sau khi tạo — Ẩn SĐT, hồ sơ học tập (trường, ngành, khóa, niên khóa, mã SV, tình trạng), định mức quỹ riêng */
  update: boolean;
}

const NO_UPDATE_NOTICE = (cols: string) => `Bạn không có quyền sửa hồ sơ thành viên — cột ${cols} bị bỏ qua.`;

async function analyze(tx: Tx, rows: ImportRow[], caps: Caps, notices: Set<string>): Promise<Analyzed[]> {
  const [unis, rooms] = await Promise.all([
    tx.query<{ id: string; name: string; code: string | null }>("SELECT id, name, code FROM universities WHERE deleted_at IS NULL").then((r) => r.rows),
    tx.query<{ code: string; name: string }>("SELECT code, name FROM rooms WHERE deleted_at IS NULL").then((r) => r.rows),
  ]);
  // Phòng nhận theo mã (P.1) hoặc tên (Phòng 1); mã ưu tiên khi trùng
  const roomByFold = new Map<string, string>();
  for (const r of rooms) roomByFold.set(fold(r.name), r.code);
  for (const r of rooms) roomByFold.set(fold(r.code), r.code);
  const uniByFold = new Map<string, string>();
  for (const u of unis) {
    uniByFold.set(fold(u.name), u.id);
    if (u.code) uniByFold.set(fold(u.code), u.id);
  }

  const out: Analyzed[] = rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fullName = r.fullName.replace(/\s+/g, " ").trim();
    const profile: MemberProfileInput & { fullName: string } = { fullName };
    if (fullName.length < 2) errors.push("Thiếu họ tên.");
    if (r.displayName) profile.displayName = r.displayName.replace(/\s+/g, " ");

    const gender = cleanGender(r.gender);
    if (gender === null) warnings.push(`Giới tính “${r.gender}” không nhận ra (dùng Nam hoặc Nữ) — để trống.`);
    else if (gender) profile.gender = gender;

    if (r.phone) {
      const p = cleanPhone(r.phone);
      if (p) profile.phone = p;
      else errors.push(`Số điện thoại “${r.phone}” không hợp lệ.`);
    }
    if (r.email) {
      const e = r.email.toLowerCase();
      if (z.string().email().max(200).safeParse(e).success) profile.email = e;
      else errors.push(`Email “${r.email}” không hợp lệ.`);
    }
    const hide = cleanYesNo(r.hidePhone);
    if (hide === null) warnings.push(`Ẩn SĐT “${r.hidePhone}” không nhận ra (dùng Có hoặc Không) — để mặc định (hiện).`);
    else if (hide) {
      if (caps.update) profile.hidePhone = true;
      else notices.add(NO_UPDATE_NOTICE("Ẩn SĐT"));
    }
    if (r.joinedOn) {
      const d = cleanJoinedOn(r.joinedOn);
      if (!d) errors.push(`Ngày vào nhà “${r.joinedOn}” không hợp lệ (dùng DD/MM/YYYY hoặc MM/YYYY).`);
      else profile.joinedOn = d;
    }

    // Thông tin riêng tư (ngày sinh, quê quán, địa chỉ, CCCD, cha/mẹ): cần quyền ghi thông tin riêng tư
    const privateCols = [r.birthDate, r.hometown, r.homeAddress, r.nationalId, r.fatherName, r.fatherPhone, r.motherName, r.motherPhone];
    if (!caps.priv) {
      if (privateCols.some(Boolean)) notices.add("Bạn không có quyền ghi thông tin riêng tư — các cột Ngày sinh, Quê quán, Địa chỉ, CCCD/CMND và Cha/Mẹ bị bỏ qua.");
    } else {
      if (r.birthDate) {
        const d = cleanDate(r.birthDate);
        const year = d ? +d.slice(0, 4) : 0;
        if (!d || year < 1940 || year > new Date().getFullYear() - 10) errors.push(`Ngày sinh “${r.birthDate}” không hợp lệ (dùng DD/MM/YYYY).`);
        else profile.birthDate = d;
      }
      if (r.hometown) profile.hometown = r.hometown;
      if (r.homeAddress) profile.homeAddress = r.homeAddress;
      if (r.nationalId) {
        const n = cleanNationalId(r.nationalId);
        if (n) profile.nationalId = n;
        else errors.push("Số CCCD/CMND không hợp lệ (CCCD có 12 số, CMND có 9 số).");
      }
      for (const rel of ["father", "mother"] as const) {
        const name = r[`${rel}Name` as const];
        const phoneRaw = r[`${rel}Phone` as const];
        if (name) profile[`${rel}Name` as const] = name;
        if (phoneRaw) {
          const p = cleanPhone(phoneRaw);
          if (!name) warnings.push(`Có SĐT ${rel === "father" ? "cha" : "mẹ"} nhưng thiếu họ tên — bỏ qua.`);
          else if (p) profile[`${rel}Phone` as const] = p;
          else warnings.push(`SĐT ${rel === "father" ? "cha" : "mẹ"} “${phoneRaw}” không hợp lệ — bỏ qua số điện thoại.`);
        }
      }
    }

    // Học vụ: chỉ lưu khi xác định được trường (hồ sơ học tập gắn với một trường)
    let universityId: string | undefined;
    if (r.universityName) {
      const key = fold(r.universityName);
      universityId = uniByFold.get(key) ?? [...uniByFold].find(([k]) => k.includes(key) || key.includes(k))?.[1];
      if (!universityId) warnings.push(`Không tìm thấy trường “${r.universityName}” trong danh mục — bỏ qua thông tin trường.`);
    }
    const status = cleanStudentStatus(r.studentStatus);
    if (status === null) warnings.push(`Tình trạng học tập “${r.studentStatus}” không nhận ra (dùng Đang học / Đã tốt nghiệp / Bảo lưu / Thôi học) — bỏ qua.`);
    const enr = cleanYear(r.enrollmentYear, 1990, 2100);
    const grad = cleanYear(r.expectedGraduationYear, 1990, 2110);
    if (enr === null) errors.push(`Năm nhập học “${r.enrollmentYear}” không hợp lệ (4 chữ số, ví dụ 2022).`);
    if (grad === null) errors.push(`Năm ra trường “${r.expectedGraduationYear}” không hợp lệ (4 chữ số, ví dụ 2026).`);
    // Niên khóa có thể ghi gộp ở cột Khóa ("K66 (2022 – 2026)"): máy chủ tự tách; ở đây chỉ dùng để kiểm tra thứ tự
    const range = /(\d{4})\s*[–-]\s*(\d{4})/.exec(r.academicYear);
    const effEnr = enr ?? (range ? +range[1] : undefined);
    const effGrad = grad ?? (range ? +range[2] : undefined);
    if (effEnr && effGrad && effGrad < effEnr) errors.push("Năm ra trường phải sau (hoặc bằng) năm nhập học.");

    const study: MemberProfileInput = {};
    if (r.major) study.major = canonicalMajor(r.major) ?? r.major;
    if (r.academicYear) study.academicYear = r.academicYear;
    if (r.studentCode) study.studentCode = r.studentCode;
    if (enr) study.enrollmentYear = enr;
    if (grad) study.expectedGraduationYear = grad;
    if (status) study.studentStatus = status;
    if (!caps.update) {
      if (universityId || Object.keys(study).length) notices.add(NO_UPDATE_NOTICE("Trường, Ngành, Khóa, Năm nhập học/ra trường, Mã sinh viên và Tình trạng học tập"));
    } else if (universityId) {
      profile.universityId = universityId;
      Object.assign(profile, study);
    } else if (Object.keys(study).length) {
      warnings.push("Có thông tin học vụ (ngành, khóa, niên khóa, mã sinh viên, tình trạng) nhưng không xác định được trường — các thông tin này sẽ không được lưu.");
    }

    // Định mức quỹ riêng (để trống = tự động theo tình trạng học tập)
    const dues = cleanMoney(r.customDuesVnd);
    if (dues === null) errors.push(`Định mức quỹ riêng “${r.customDuesVnd}” không hợp lệ (số tiền VNĐ, tối đa 50.000.000).`);
    else if (dues !== undefined) {
      if (caps.update) profile.customDuesVnd = dues;
      else notices.add(NO_UPDATE_NOTICE("Định mức quỹ riêng"));
    }

    let roomCode: string | null = null;
    if (r.roomCode) {
      roomCode = roomByFold.get(fold(r.roomCode)) ?? null;
      if (!roomCode) warnings.push(`Không có phòng “${r.roomCode}” — để chưa xếp phòng.`);
    }
    return { line: i + 1, fullName: fullName || "(không tên)", errors, warnings, profile, roomCode };
  });

  // Trùng trong tệp
  const seen = new Map<string, number>();
  for (const a of out) {
    const keys: [string, string | null | undefined][] = [
      ["số điện thoại", a.profile.phone],
      ["email", a.profile.email],
      ["số CCCD/CMND", a.profile.nationalId],
    ];
    for (const [label, value] of keys) {
      if (!value) continue;
      const key = `${label}:${value}`;
      const first = seen.get(key);
      if (first !== undefined) a.errors.push(`Trùng ${label} với dòng ${first} trong tệp.`);
      else seen.set(key, a.line);
    }
  }
  // Trùng với người đã có trong nhà
  const phones = out.map((a) => a.profile.phone).filter((x): x is string => !!x);
  const emails = out.map((a) => a.profile.email).filter((x): x is string => !!x);
  if (phones.length || emails.length) {
    const dup = (
      await tx.query<{ full_name: string; phone: string | null; email: string | null }>(
        `SELECT full_name, contact_phone_e164 AS phone, lower(contact_email) AS email FROM members
          WHERE deleted_at IS NULL AND (contact_phone_e164 = ANY($1::text[]) OR lower(contact_email) = ANY($2::text[]))`,
        [phones, emails]
      )
    ).rows;
    for (const a of out) {
      const hit = dup.find((d) => (a.profile.phone && d.phone === a.profile.phone) || (a.profile.email && d.email === a.profile.email));
      if (hit) a.errors.push(`Đã có thành viên “${hit.full_name}” dùng cùng ${a.profile.phone && hit.phone === a.profile.phone ? "số điện thoại" : "email"}.`);
    }
  }
  // CCCD đã có ở người khác: KHÔNG kiểm tra trước được — cột national_id_enc/bidx cố ý không cấp SELECT cho luuxa_app (chỉ đọc qua hàm có kiểm quyền + nhật ký).
  // Chỉ mục unique ux_member_private__nid_bidx của DB chặn khi ghi; lỗi được đổi thành thông báo rõ ràng ở friendlyError() và chỉ hủy dòng đó.
  return out;
}

export async function importMembers(tx: Tx, rows: ImportRow[], dryRun: boolean): Promise<ImportResult> {
  const perm = await permissions(tx, ["member.create", "member.update", "member.private.write"] as const);
  if (!perm["member.create"]) throw forbidden("Bạn không có quyền thêm thành viên.");
  const caps: Caps = { priv: perm["member.private.write"], update: perm["member.update"] };
  const notices = new Set<string>();
  const analyzed = await analyze(tx, rows, caps, notices);
  const results: ImportRowResult[] = [];
  let created = 0;

  for (const a of analyzed) {
    if (a.errors.length) {
      results.push({ line: a.line, fullName: a.fullName, status: "error", messages: [...a.errors, ...a.warnings] });
      continue;
    }
    if (dryRun) {
      results.push({ line: a.line, fullName: a.fullName, status: a.warnings.length ? "warning" : "ok", messages: a.warnings });
      continue;
    }
    // Mỗi dòng một điểm lưu: lỗi (RLS, ràng buộc, phòng đầy…) chỉ hủy dòng đó
    await tx.query("SAVEPOINT import_row");
    try {
      const id = await createMemberProfile(tx, a.profile);
      const msgs = [...a.warnings];
      if (a.roomCode) {
        try {
          await tx.query("SAVEPOINT import_room");
          await assignRoom(tx, id, a.roomCode, "Nhập từ tệp");
          await tx.query("RELEASE SAVEPOINT import_room");
        } catch (e) {
          await tx.query("ROLLBACK TO SAVEPOINT import_room");
          msgs.push(`Chưa xếp được vào phòng ${a.roomCode}: ${(e as Error).message}`);
        }
      }
      await tx.query("RELEASE SAVEPOINT import_row");
      created++;
      results.push({ line: a.line, fullName: a.fullName, status: "created", messages: msgs });
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT import_row");
      results.push({ line: a.line, fullName: a.fullName, status: "failed", messages: [...a.warnings, friendlyError(e)] });
    }
  }
  const count = (s: ImportRowResult["status"]) => results.filter((r) => r.status === s).length;
  return {
    dryRun,
    total: results.length,
    ok: count("ok") + count("warning") + count("created"),
    warnings: count("warning"),
    errors: count("error") + count("failed"),
    created,
    notices: [...notices],
    rows: results,
  };
}
