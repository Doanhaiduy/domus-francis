import "server-only";
import type { Tx } from "../db";
import { ApiError, notFound } from "../errors";
import { decryptPii, encryptPii, blindIndex, digitsOnly, last4, PII_KEY_VERSION } from "../pii";
import type { ApplicationDto, MemberDetailDto, MemberDto } from "@/lib/types/members";

// ---------------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------------
const POSITION_ROLE: Record<string, string> = {
  house_head: "Trưởng nhà",
  vice_head: "Phó nhà",
  treasurer: "Thủ quỹ",
  sysadmin: "Admin",
};
const SACRAMENT_LABEL: Record<string, string> = {
  baptism: "Rửa tội",
  eucharist: "Thánh thể",
  confirmation: "Thêm sức",
  penance: "Hòa giải",
  anointing: "Xức dầu bệnh nhân",
  holy_orders: "Truyền chức thánh",
  matrimony: "Hôn phối",
};
export const SACRAMENT_CODE = Object.fromEntries(Object.entries(SACRAMENT_LABEL).map(([k, v]) => [v, k]));

export const toLocalPhone = (e164: string | null | undefined) => {
  if (!e164) return "";
  const d = e164.replace(/^\+84/, "0");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const dmy = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : undefined);
const my = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ---------------------------------------------------------------------
// Danh bạ
// ---------------------------------------------------------------------
const MEMBER_SELECT = `
  SELECT m.id, m.member_no, m.user_id, m.full_name, m.display_name, m.gender::text, m.status::text, m.joined_on,
         m.avatar_file_id, m.hide_phone, m.contact_email::text,
         CASE WHEN m.hide_phone AND NOT (app.is_self(m.id) OR app.has_permission('member.private.read'))
              THEN NULL ELSE m.contact_phone_e164 END AS phone,
         r.code AS room_code, r.name AS room_name,
         pos.position_code, pos.position_name, mp.responsibilities,
         cp.holy_name, cp.parish_name, d.name AS diocese_name,
         COALESCE(sp.major, ds.major) AS major, COALESCE(sp.cohort_label, ds.cohort_label) AS cohort_label, sp.student_code,
         un.name AS university_name,
         to_char(mpd.birth_date, 'DD/MM/YYYY') AS birth_dmy
    FROM members m
    LEFT JOIN room_assignments ra ON ra.member_id = m.id AND ra.starts_on <= app.local_today()
                                  AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())
    LEFT JOIN rooms r ON r.id = ra.room_id
    LEFT JOIN v_member_current_position pos ON pos.member_id = m.id
    LEFT JOIN LATERAL (
      SELECT x.responsibilities FROM member_positions x JOIN positions p ON p.id = x.position_id
       WHERE x.member_id = m.id AND p.code = pos.position_code AND x.starts_on <= app.local_today()
         AND (x.ends_on IS NULL OR x.ends_on >= app.local_today())
       ORDER BY x.starts_on DESC LIMIT 1) mp ON true
    LEFT JOIN catholic_profiles cp ON cp.member_id = m.id
    LEFT JOIN dioceses d ON d.id = cp.diocese_id
    LEFT JOIN student_profiles sp ON sp.member_id = m.id AND sp.is_current AND sp.deleted_at IS NULL
    LEFT JOIN app.fn_directory_study(ARRAY(SELECT x.id FROM members x WHERE x.deleted_at IS NULL)) ds ON ds.member_id = m.id
    LEFT JOIN universities un ON un.id = COALESCE(sp.university_id, ds.university_id)
    LEFT JOIN member_private_details mpd ON mpd.member_id = m.id`;

type MemberRow = Record<string, any>;

function toMemberDto(r: MemberRow): MemberDto {
  return {
    id: r.id,
    memberNo: r.member_no,
    userId: r.user_id,
    name: r.display_name,
    fullName: r.full_name,
    holyName: r.holy_name ?? undefined,
    room: r.room_code ?? "Chưa xếp phòng",
    roomName: r.room_name ?? undefined,
    phone: toLocalPhone(r.phone),
    email: r.contact_email ?? undefined,
    hidePhone: r.hide_phone,
    role: POSITION_ROLE[r.position_code] ?? "Thành viên",
    positionCode: r.position_code ?? undefined,
    duty: r.responsibilities ?? r.position_name ?? undefined,
    status: r.status,
    joined: my(r.joined_on),
    joinedOn: r.joined_on,
    avatarText: initials(r.display_name),
    avatarFileId: r.avatar_file_id,
    avatarUrl: r.avatar_file_id ? `/api/v1/files/${r.avatar_file_id}?v=thumb` : undefined,
    gender: r.gender === "female" ? "Nữ" : r.gender === "male" ? "Nam" : undefined,
    university: r.university_name ?? undefined,
    major: r.major ?? undefined,
    academicYear: r.cohort_label ?? undefined,
    studentCode: r.student_code ?? undefined,
    diocese: r.diocese_name ?? undefined,
    parish: r.parish_name ?? undefined,
    birthDate: r.birth_dmy ?? undefined,
  };
}

export async function listMembers(tx: Tx, opts: { includeFormer?: boolean } = {}): Promise<MemberDto[]> {
  const rows = (
    await tx.query(
      `${MEMBER_SELECT}
        WHERE m.deleted_at IS NULL ${opts.includeFormer ? "" : "AND m.status IN ('active', 'on_leave')"}
        ORDER BY CASE pos.position_code WHEN 'house_head' THEN 1 WHEN 'vice_head' THEN 2 WHEN 'treasurer' THEN 3 ELSE 9 END, m.member_no`
    )
  ).rows;
  return rows.map(toMemberDto);
}

export async function getMemberDetail(tx: Tx, id: string): Promise<MemberDetailDto> {
  const r = (await tx.query(`${MEMBER_SELECT} WHERE m.id = $1 AND m.deleted_at IS NULL`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy thành viên.");
  const base = toMemberDto(r);
  const perms = (
    await tx.query<{ self: boolean; priv: boolean; cath: boolean; nid: boolean; upd: boolean; pw: boolean; guard: boolean }>(
      `SELECT app.is_self($1) AS self, app.has_permission('member.private.read') AS priv, app.can_view_catholic($1) AS cath,
              app.has_permission('member.national_id.read') AS nid, app.has_permission('member.update') AS upd,
              app.has_permission('member.private.write') AS pw, app.has_permission('member.guardian.read') AS guard`,
      [id]
    )
  ).rows[0];
  const priv = (
    await tx.query(
      "SELECT birth_date, hometown, home_address, national_id_last4 FROM member_private_details WHERE member_id = $1",
      [id]
    )
  ).rows[0];
  const cath = (
    await tx.query("SELECT holy_name, diocese_id, parish_name, pastor_name FROM catholic_profiles WHERE member_id = $1", [id])
  ).rows[0];
  const sacr = (await tx.query<{ sacrament: string }>("SELECT sacrament::text FROM member_sacraments WHERE member_id = $1 ORDER BY sacrament", [id])).rows;
  const guardians = (
    await tx.query(
      `SELECT id, relation::text, full_name, phone_enc, phone_last4, is_emergency_contact
         FROM member_guardians WHERE member_id = $1 AND deleted_at IS NULL ORDER BY relation`,
      [id]
    )
  ).rows;
  const sp = (await tx.query("SELECT university_id FROM student_profiles WHERE member_id = $1 AND is_current AND deleted_at IS NULL", [id])).rows[0];
  const history = (
    await tx.query(
      `SELECT r.code, r.name, ra.starts_on, ra.ends_on FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
        WHERE ra.member_id = $1 ORDER BY ra.starts_on DESC`,
      [id]
    )
  ).rows;

  // CCCD luôn hiển thị dạng che; xem đầy đủ qua revealNationalId (cần quyền + lý do, ghi kiểm toán — vá C-016)
  const identityCard = priv?.national_id_last4 ? `•••• •••• ${priv.national_id_last4}` : undefined;
  const g = guardians.map((x) => ({
    id: x.id,
    relation: x.relation,
    fullName: x.full_name,
    phone: x.phone_enc ? toLocalPhone(decryptPii(x.phone_enc)) || `•••• ${x.phone_last4}` : null,
    isEmergencyContact: x.is_emergency_contact,
  }));
  const father = g.find((x) => x.relation === "father");
  const mother = g.find((x) => x.relation === "mother");
  const withPhone = (x?: (typeof g)[number]) => (x ? `${x.fullName}${x.phone ? ` (${x.phone})` : ""}` : undefined);

  return {
    ...base,
    holyName: cath?.holy_name ?? base.holyName,
    birthDate: dmy(priv?.birth_date),
    birthDateIso: priv?.birth_date ?? undefined,
    hometown: priv?.hometown ?? undefined,
    homeAddress: priv?.home_address ?? undefined,
    identityCard,
    identityMasked: !!identityCard,
    canRevealNationalId: perms.nid && !!identityCard,
    pastor: cath?.pastor_name ?? undefined,
    dioceseId: cath?.diocese_id ?? null,
    sacraments: sacr.map((s) => SACRAMENT_LABEL[s.sacrament] ?? s.sacrament),
    fatherName: withPhone(father),
    motherName: withPhone(mother),
    parentPhone: (g.find((x) => x.isEmergencyContact && x.phone) ?? father ?? mother)?.phone ?? undefined,
    guardians: g,
    universityId: sp?.university_id ?? null,
    canViewPrivate: perms.self || perms.priv,
    canViewCatholic: perms.cath,
    canEdit: perms.self || perms.upd,
    canEditPrivate: perms.self || perms.pw,
    roomHistory: history.map((h) => ({ roomCode: h.code, roomName: h.name, startsOn: h.starts_on, endsOn: h.ends_on })),
  };
}

// ---------------------------------------------------------------------
// Tạo / sửa hồ sơ
// ---------------------------------------------------------------------
export interface MemberProfileInput {
  fullName?: string;
  displayName?: string;
  gender?: "Nam" | "Nữ" | null;
  phone?: string | null;
  email?: string | null;
  hidePhone?: boolean;
  avatarFileId?: string | null;
  joinedOn?: string;
  // tầng 2
  birthDate?: string | null; // YYYY-MM-DD
  hometown?: string | null;
  homeAddress?: string | null;
  nationalId?: string | null;
  fatherName?: string | null;
  fatherPhone?: string | null;
  motherName?: string | null;
  motherPhone?: string | null;
  // tầng 3
  holyName?: string | null;
  dioceseId?: string | null;
  parish?: string | null;
  pastor?: string | null;
  sacraments?: string[];
  // học vụ
  universityId?: string | null;
  major?: string | null;
  academicYear?: string | null;
  studentCode?: string | null;
}

export const toE164 = (p: string | null | undefined): string | null => {
  if (!p || !p.trim()) return null;
  const d = digitsOnly(p);
  if (p.trim().startsWith("+")) return `+${d}`;
  return d.startsWith("0") ? `+84${d.slice(1)}` : `+${d}`;
};
const genderCode = (g: string | null | undefined) => (g === "Nữ" ? "female" : g === "Nam" ? "male" : null);
const has = <T extends object>(o: T, k: keyof T) => Object.prototype.hasOwnProperty.call(o, k);

/** Ghi các trường được gửi lên; RLS + trigger quyết định ai sửa được gì (chính chủ / cán bộ có quyền). */
export async function saveMemberProfile(tx: Tx, memberId: string, p: MemberProfileInput) {
  // Tầng 1
  const sets: string[] = [];
  const vals: unknown[] = [memberId];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (has(p, "fullName") && p.fullName) set("full_name", p.fullName.trim());
  if (has(p, "displayName") && p.displayName) set("display_name", p.displayName.trim());
  if (has(p, "gender")) set("gender", genderCode(p.gender));
  if (has(p, "phone")) set("contact_phone_e164", toE164(p.phone));
  if (has(p, "email")) set("contact_email", p.email?.trim() || null);
  if (has(p, "hidePhone")) set("hide_phone", !!p.hidePhone);
  if (has(p, "avatarFileId")) set("avatar_file_id", p.avatarFileId || null);
  if (has(p, "joinedOn") && p.joinedOn) set("joined_on", p.joinedOn);
  if (sets.length) {
    const r = await tx.query(`UPDATE members SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
    if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền sửa hồ sơ này.");
  }

  // Tầng 2
  const t2 = ["birthDate", "hometown", "homeAddress", "nationalId"] as const;
  if (t2.some((k) => has(p, k))) {
    const cur = (await tx.query("SELECT 1 FROM member_private_details WHERE member_id = $1", [memberId])).rowCount;
    const nid = has(p, "nationalId") ? (p.nationalId ? digitsOnly(p.nationalId) : null) : undefined;
    if (nid !== undefined && nid !== null && !/^\d{9}$|^\d{12}$/.test(nid)) throw new ApiError(400, "BAD_NATIONAL_ID", "Số CCCD/CMND phải có 9 hoặc 12 chữ số.");
    const fields: Record<string, unknown> = {};
    if (has(p, "birthDate")) fields.birth_date = p.birthDate || null;
    if (has(p, "hometown")) fields.hometown = p.hometown?.trim() || null;
    if (has(p, "homeAddress")) fields.home_address = p.homeAddress?.trim() || null;
    if (nid !== undefined) {
      fields.national_id_enc = nid ? encryptPii(nid) : null;
      fields.national_id_key_version = nid ? PII_KEY_VERSION : null;
      fields.national_id_bidx = nid ? blindIndex(nid) : null;
      fields.national_id_last4 = nid ? last4(nid) : null;
    }
    const cols = Object.keys(fields);
    if (cur) {
      const r = await tx.query(
        `UPDATE member_private_details SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE member_id = $1`,
        [memberId, ...cols.map((c) => fields[c])]
      );
      if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền sửa thông tin riêng tư.");
    } else {
      await tx.query(
        `INSERT INTO member_private_details (member_id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})`,
        [memberId, ...cols.map((c) => fields[c])]
      );
    }
  }

  // Người giám hộ (cha/mẹ)
  for (const rel of ["father", "mother"] as const) {
    const nk = `${rel}Name` as const;
    const pk = `${rel}Phone` as const;
    if (!has(p, nk) && !has(p, pk)) continue;
    const name = p[nk]?.trim();
    const phone = toE164(p[pk]);
    const existing = (await tx.query<{ id: string }>("SELECT id FROM member_guardians WHERE member_id = $1 AND relation = $2 AND deleted_at IS NULL LIMIT 1", [memberId, rel])).rows[0];
    if (!name) {
      if (existing) await tx.query("UPDATE member_guardians SET deleted_at = now() WHERE id = $1", [existing.id]);
      continue;
    }
    const enc = phone ? encryptPii(phone) : null;
    if (existing) {
      await tx.query(
        "UPDATE member_guardians SET full_name = $2, phone_enc = $3, phone_key_version = $4, phone_last4 = $5 WHERE id = $1",
        [existing.id, name, enc, phone ? PII_KEY_VERSION : null, phone ? last4(phone) : null]
      );
    } else {
      await tx.query(
        `INSERT INTO member_guardians (member_id, relation, full_name, phone_enc, phone_key_version, phone_last4, is_emergency_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [memberId, rel, name, enc, phone ? PII_KEY_VERSION : null, phone ? last4(phone) : null, rel === "father"]
      );
    }
  }

  // Tầng 3 (cần đồng ý catholic_profile — trigger chặn nếu chưa có)
  const t3 = ["holyName", "dioceseId", "parish", "pastor"] as const;
  if (t3.some((k) => has(p, k))) {
    const fields: Record<string, unknown> = {};
    if (has(p, "holyName")) fields.holy_name = p.holyName?.trim() || null;
    if (has(p, "dioceseId")) fields.diocese_id = p.dioceseId || null;
    if (has(p, "parish")) fields.parish_name = p.parish?.trim() || null;
    if (has(p, "pastor")) fields.pastor_name = p.pastor?.trim() || null;
    const cols = Object.keys(fields);
    await tx.query(
      `INSERT INTO catholic_profiles (member_id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
       ON CONFLICT (member_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
      [memberId, ...cols.map((c) => fields[c])]
    );
  }
  if (has(p, "sacraments") && p.sacraments) {
    const want = new Set(p.sacraments.map((s) => SACRAMENT_CODE[s] ?? s).filter((s) => s in SACRAMENT_LABEL));
    const cur = new Set((await tx.query<{ s: string }>("SELECT sacrament::text AS s FROM member_sacraments WHERE member_id = $1", [memberId])).rows.map((r) => r.s));
    for (const s of cur) if (!want.has(s)) await tx.query("DELETE FROM member_sacraments WHERE member_id = $1 AND sacrament = $2", [memberId, s]);
    for (const s of want) if (!cur.has(s)) await tx.query("INSERT INTO member_sacraments (member_id, sacrament) VALUES ($1, $2)", [memberId, s]);
  }

  // Học vụ
  const t4 = ["universityId", "major", "academicYear", "studentCode"] as const;
  if (t4.some((k) => has(p, k))) {
    const cur = (await tx.query<{ id: string; university_id: string }>("SELECT id, university_id FROM student_profiles WHERE member_id = $1 AND is_current AND deleted_at IS NULL", [memberId])).rows[0];
    const uni = has(p, "universityId") ? p.universityId : cur?.university_id;
    const years = /(\d{4})\s*[–-]\s*(\d{4})/.exec(p.academicYear ?? "");
    if (cur) {
      await tx.query(
        `UPDATE student_profiles SET university_id = COALESCE($2, university_id), major = $3, cohort_label = $4, student_code = $5,
                enrollment_year = COALESCE($6, enrollment_year), expected_graduation_year = COALESCE($7, expected_graduation_year)
          WHERE id = $1`,
        [cur.id, uni ?? null, p.major ?? null, p.academicYear ?? null, p.studentCode ?? null, years ? Number(years[1]) : null, years ? Number(years[2]) : null]
      );
    } else if (uni) {
      await tx.query(
        `INSERT INTO student_profiles (member_id, university_id, major, cohort_label, student_code, enrollment_year, expected_graduation_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [memberId, uni, p.major ?? null, p.academicYear ?? null, p.studentCode ?? null, years ? Number(years[1]) : null, years ? Number(years[2]) : null]
      );
    }
  }
}

export async function createMemberProfile(tx: Tx, input: MemberProfileInput & { fullName: string; userId?: string | null }): Promise<string> {
  const name = input.displayName?.trim() || input.fullName.trim().split(/\s+/).slice(-2).join(" ");
  const r = await tx.query<{ id: string }>(
    `INSERT INTO members (user_id, full_name, display_name, gender, contact_phone_e164, contact_email, joined_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, app.local_today()), app.current_user_id()) RETURNING id`,
    [input.userId ?? null, input.fullName.trim(), name, genderCode(input.gender), toE164(input.phone), input.email?.trim() || null, input.joinedOn ?? null]
  );
  const id = r.rows[0].id;
  const rest = { ...input } as MemberProfileInput;
  delete rest.fullName;
  delete rest.displayName;
  delete rest.gender;
  delete rest.phone;
  delete rest.email;
  delete rest.joinedOn;
  await saveMemberProfile(tx, id, rest);
  return id;
}

export async function changeMemberStatus(tx: Tx, memberId: string, status: string, leftOn: string | null, reason: string | null) {
  const r = await tx.query(
    `UPDATE members SET status = $2::member_status_t,
            left_on = CASE WHEN $2 IN ('left', 'alumni') THEN COALESCE($3::date, app.local_today()) ELSE NULL END,
            left_reason = CASE WHEN $2 IN ('left', 'alumni') THEN $4 ELSE NULL END
      WHERE id = $1 AND deleted_at IS NULL`,
    [memberId, status, leftOn, reason]
  );
  if (!r.rowCount) throw notFound("Không tìm thấy thành viên.");
}

// ---------------------------------------------------------------------
// Đơn đăng ký
// ---------------------------------------------------------------------
export async function listApplications(tx: Tx, all = false): Promise<ApplicationDto[]> {
  const rows = (
    await tx.query(
      `SELECT id, full_name, email::text, phone_e164, university_name, message, status::text, created_at, reviewed_at, review_note
         FROM member_applications ${all ? "" : "WHERE status IN ('submitted', 'under_review')"}
        ORDER BY created_at DESC LIMIT 200`
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: toLocalPhone(r.phone_e164) || null,
    universityName: r.university_name,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
  }));
}

/** Giải mã CCCD đầy đủ: app.fn_national_id_cipher kiểm quyền member.national_id.read + lý do ≥ 5 ký tự và ghi audit READ_SENSITIVE. */
export async function revealNationalId(tx: Tx, memberId: string, reason: string): Promise<string | null> {
  const r = (await tx.query<{ national_id_enc: Buffer | null }>("SELECT national_id_enc FROM app.fn_national_id_cipher($1, $2)", [memberId, reason])).rows[0];
  return r?.national_id_enc ? decryptPii(r.national_id_enc) : null;
}
