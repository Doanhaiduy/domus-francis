import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden } from "../errors";
import { permissions } from "./community-shared";
import { assignRoom } from "./house";
import { createMemberProfile, type MemberProfileInput } from "./members";

// Nhập hàng loạt thành viên từ bảng tính (Excel/CSV). Trình duyệt đọc tệp rồi gửi các dòng dạng JSON; máy chủ chuẩn hóa, kiểm tra từng dòng,
// phát hiện trùng (SĐT/email với người đã có hoặc trùng trong tệp) và — khi xác nhận — tạo từng thành viên trong một điểm lưu riêng
// (một dòng lỗi không làm hỏng cả lô). KHÔNG nhập thông tin Công giáo (cần chính thành viên đồng ý) và không cấp tài khoản.

export const IMPORT_MAX_ROWS = 300;
const cell = (max: number) => z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max)));

export const ImportRowSchema = z.object({
  fullName: cell(120),
  gender: cell(20),
  phone: cell(30),
  email: cell(200),
  birthDate: cell(30),
  hometown: cell(200),
  universityName: cell(200),
  major: cell(200),
  academicYear: cell(60),
  studentCode: cell(30),
  roomCode: cell(14),
  joinedOn: cell(30),
  fatherName: cell(120),
  fatherPhone: cell(30),
  motherName: cell(120),
  motherPhone: cell(30),
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

interface Analyzed {
  line: number;
  fullName: string;
  errors: string[];
  warnings: string[];
  profile: MemberProfileInput & { fullName: string };
  roomCode: string | null;
}

async function analyze(tx: Tx, rows: ImportRow[]): Promise<Analyzed[]> {
  const [unis, rooms] = await Promise.all([
    tx.query<{ id: string; name: string; code: string | null }>("SELECT id, name, code FROM universities WHERE deleted_at IS NULL").then((r) => r.rows),
    tx.query<{ code: string }>("SELECT code FROM rooms WHERE deleted_at IS NULL").then((r) => r.rows),
  ]);
  const roomByFold = new Map(rooms.map((r) => [fold(r.code), r.code]));
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
    if (r.birthDate) {
      const d = cleanDate(r.birthDate);
      const year = d ? +d.slice(0, 4) : 0;
      if (!d || year < 1940 || year > new Date().getFullYear() - 10) errors.push(`Ngày sinh “${r.birthDate}” không hợp lệ (dùng DD/MM/YYYY).`);
      else profile.birthDate = d;
    }
    if (r.joinedOn) {
      const d = cleanDate(r.joinedOn);
      if (!d) errors.push(`Ngày vào nhà “${r.joinedOn}” không hợp lệ (dùng DD/MM/YYYY).`);
      else profile.joinedOn = d;
    }
    if (r.hometown) profile.hometown = r.hometown;

    if (r.universityName) {
      const key = fold(r.universityName);
      const id = uniByFold.get(key) ?? [...uniByFold].find(([k]) => k.includes(key) || key.includes(k))?.[1];
      if (id) profile.universityId = id;
      else warnings.push(`Không tìm thấy trường “${r.universityName}” trong danh mục — bỏ qua thông tin trường.`);
    }
    if (profile.universityId || r.major || r.academicYear || r.studentCode) {
      if (r.major) profile.major = r.major;
      if (r.academicYear) profile.academicYear = r.academicYear;
      if (r.studentCode) profile.studentCode = r.studentCode;
      if (!profile.universityId && (r.major || r.academicYear || r.studentCode)) {
        warnings.push("Có ngành/năm học/mã sinh viên nhưng không xác định được trường — các thông tin học vụ sẽ không được lưu.");
        delete profile.major;
        delete profile.academicYear;
        delete profile.studentCode;
      }
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
    for (const key of [a.profile.phone && `p:${a.profile.phone}`, a.profile.email && `e:${a.profile.email}`].filter((x): x is string => !!x)) {
      const first = seen.get(key);
      if (first !== undefined) a.errors.push(`Trùng ${key.startsWith("p:") ? "số điện thoại" : "email"} với dòng ${first} trong tệp.`);
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
  return out;
}

export async function importMembers(tx: Tx, rows: ImportRow[], dryRun: boolean): Promise<ImportResult> {
  if (!(await permissions(tx, ["member.create"] as const))["member.create"]) throw forbidden("Bạn không có quyền thêm thành viên.");
  const analyzed = await analyze(tx, rows);
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
      results.push({ line: a.line, fullName: a.fullName, status: "failed", messages: [...a.warnings, (e as Error).message] });
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
    rows: results,
  };
}
