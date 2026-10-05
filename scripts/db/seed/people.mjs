// Seed: tài khoản, hồ sơ thành viên (3 tầng dữ liệu), đồng ý, vai trò, chức danh, phân phòng.
// Nguồn: INITIAL_MEMBERS của giao diện cũ (src/lib/mockData.ts → scripts/db/seed/mock-source.ts).
import { encryptPii, blindIndex, digitsOnly, last4, PII_KEY_VERSION } from "../../../src/server/pii.ts";

export const DEMO_PASSWORD = "LuuXa@2026";

// mock id → (email, vai trò hệ thống, mã chức danh)
const ACCOUNTS = {
  1: { email: "tuan.nguyen@luuxa.local", roles: ["member"], position: null },
  2: { email: "duc.tran@luuxa.local", roles: ["house_head", "member"], position: "house_head" },
  3: { email: "long.le@luuxa.local", roles: ["member"], position: null }, // không còn vai trò Phó nhà (db/data/2026-10-05-01_roles.sql)
  4: { email: "bao.pham@luuxa.local", roles: ["treasurer", "member"], position: "treasurer" },
  5: { email: "viet.vu@luuxa.local", roles: ["admin", "member"], position: "sysadmin" },
  6: { email: "phong.dang@luuxa.local", roles: ["liturgy_lead", "member"], position: "liturgy_head" },
  7: { email: "hieu.bui@luuxa.local", roles: ["member"], position: "logistics" },
  8: { email: "khoi.hoang@luuxa.local", roles: ["kitchen_lead", "member"], position: "kitchen_head" },
  9: { email: "khoa.ngo@luuxa.local", roles: ["media_lead", "member"], position: "media" },
  10: { email: "kiet.do@luuxa.local", roles: ["member"], position: "library" },
  11: { email: "nam.phan@luuxa.local", roles: ["member"], position: "laundry" },
  12: { email: "phuoc.ly@luuxa.local", roles: ["member"], position: "sound" },
};

const UNI = {
  "ĐH Bách Khoa Hà Nội": "HUST",
  "ĐH Kinh Tế Quốc Dân": "NEU",
  "ĐH Xây Dựng Hà Nội": "HUCE",
  "ĐH Ngoại Thương Hà Nội": "FTU",
  "ĐH Y Hà Nội": "HMU",
  "ĐH Giao Thông Vận Tải": "UTC",
  "ĐH Sư Phạm Hà Nội": "HNUE",
  "ĐH Kiến Trúc Hà Nội": "HAU",
  "ĐH Khoa Học Tự Nhiên (ĐHQGHN)": "HUS",
  "ĐH Thủy Lợi": "TLU",
  "Học Viện Báo Chí & Tuyên Truyền": "AJC",
};
const SACRAMENT = { "Rửa tội": "baptism", "Thánh thể": "eucharist", "Thêm sức": "confirmation", "Hòa giải": "penance" };

const toE164 = (p) => (p ? "+84" + digitsOnly(p).replace(/^0/, "") : null);
const dmy = (s) => (s && /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.split("/").reverse().join("-") : null);
const joinedOn = (s) => {
  const m = /^(\d{2})\/(\d{4})$/.exec(s || "");
  return m ? `${m[2]}-${m[1]}-01` : "2025-09-01";
};
const parseParent = (s) => {
  if (!s) return null;
  const m = /^(.*?)\s*\(([\d.\s]+)\)\s*$/.exec(s);
  return m ? { name: m[1].trim(), phone: m[2] } : { name: s.trim(), phone: null };
};
const cohort = (s) => {
  const m = /\((\d{4})\s*–\s*(\d{4})\)/.exec(s || "");
  return m ? { from: Number(m[1]), to: Number(m[2]) } : { from: null, to: null };
};

export async function seed(ctx) {
  const { q, mock, ids, hashPassword } = ctx;
  const pwHash = await hashPassword(DEMO_PASSWORD);
  const year = (await q("SELECT id FROM academic_years WHERE is_current"))[0].id;
  const term = (await q("SELECT id FROM board_terms WHERE status = 'active' ORDER BY starts_on DESC LIMIT 1"))[0].id;
  const purposes = await q("SELECT code, current_version FROM consent_purposes");
  const pv = Object.fromEntries(purposes.map((p) => [p.code, p.current_version]));
  await q(
    "INSERT INTO universities (code, name, short_name, city) VALUES ('HMU', 'Đại học Y Hà Nội', 'ĐH Y HN', 'Hà Nội') ON CONFLICT (code) DO NOTHING"
  );

  ids.user = {};
  ids.member = {};
  ids.memberByName = {};
  ids.memberByFullName = {};
  ids.userByRole = {};

  for (const m of mock.INITIAL_MEMBERS) {
    const acc = ACCOUNTS[m.id];
    const [u] = await q(
      `INSERT INTO users (email, phone_e164, password_hash, password_changed_at, status, email_verified_at, last_login_at)
       VALUES ($1, $2, $3, now(), 'active', now(), NULL) RETURNING id`,
      [acc.email, toE164(m.phone), pwHash]
    );
    ids.user[m.id] = u.id;
    for (const r of acc.roles) ids.userByRole[r] ??= u.id;
  }
  // Mọi thao tác tiếp theo ghi audit dưới tên Trưởng nhà (người nhập liệu ban đầu)
  await ctx.as(ids.user[2]);

  for (const m of mock.INITIAL_MEMBERS) {
    const acc = ACCOUNTS[m.id];
    const uid = ids.user[m.id];
    for (const r of acc.roles) {
      await q(
        `INSERT INTO user_roles (user_id, role_id, board_term_id, granted_by, valid_from, note)
         SELECT $1, r.id, CASE WHEN r.code = 'member' THEN NULL ELSE $3::uuid END, $4, now() - interval '30 days', 'Dữ liệu khởi tạo'
           FROM roles r WHERE r.code = $2`,
        [uid, r, term, ids.user[2]]
      );
    }
    const [mem] = await q(
      `INSERT INTO members (user_id, full_name, display_name, gender, contact_phone_e164, contact_email, joined_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [uid, m.fullName, m.name, m.gender === "Nữ" ? "female" : "male", toE164(m.phone), acc.email, joinedOn(m.joined), ids.user[2]]
    );
    ids.member[m.id] = mem.id;
    ids.memberByName[m.name] = mem.id;
    ids.memberByFullName[m.fullName] = mem.id;

    // Đồng ý (bằng chứng nhập từ hồ sơ giấy)
    for (const code of ["terms_of_use", "privacy_notice_ack", "catholic_profile", "catholic_share_leadership", "academic_share_leadership", "photo_tagging"]) {
      await q(
        `INSERT INTO consents (member_id, purpose_code, policy_version, method, evidence_note, recorded_by)
         VALUES ($1, $2, $3, 'paper', 'Phiếu đồng ý giấy khi nhập học (dữ liệu khởi tạo)', $4)`,
        [mem.id, code, pv[code] ?? 1, ids.user[2]]
      );
    }

    // Tầng 2: thông tin riêng tư (CCCD mã hóa tầng ứng dụng)
    const nid = m.identityCard ? digitsOnly(m.identityCard) : null;
    await q(
      `INSERT INTO member_private_details (member_id, birth_date, hometown, home_address,
                                           national_id_enc, national_id_key_version, national_id_bidx, national_id_last4)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [mem.id, dmy(m.birthDate), m.hometown ?? null, m.homeAddress ?? null,
       nid ? encryptPii(nid) : null, nid ? PII_KEY_VERSION : null, nid ? blindIndex(nid) : null, nid ? last4(nid) : null]
    );
    for (const [rel, raw] of [["father", m.fatherName], ["mother", m.motherName]]) {
      const p = parseParent(raw);
      if (!p) continue;
      const phone = p.phone || (rel === "father" ? m.parentPhone : null);
      await q(
        `INSERT INTO member_guardians (member_id, relation, full_name, phone_enc, phone_key_version, phone_last4, is_emergency_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [mem.id, rel, p.name, phone ? encryptPii(toE164(phone)) : null, phone ? PII_KEY_VERSION : null, phone ? last4(phone) : null, rel === "father"]
      );
    }

    // Tầng 3: Công giáo (cần đồng ý catholic_profile — đã ghi ở trên)
    const dio = m.diocese ? (await q("SELECT id FROM dioceses WHERE name = $1", [m.diocese]))[0]?.id ?? null : null;
    await q(
      "INSERT INTO catholic_profiles (member_id, holy_name, diocese_id, parish_name, pastor_name) VALUES ($1, $2, $3, $4, $5)",
      [mem.id, m.holyName ?? null, dio, m.parish ?? null, m.pastor ?? null]
    );
    for (const s of m.sacraments ?? []) {
      if (SACRAMENT[s]) await q("INSERT INTO member_sacraments (member_id, sacrament) VALUES ($1, $2)", [mem.id, SACRAMENT[s]]);
    }

    // Hồ sơ sinh viên
    const uniCode = UNI[m.university];
    if (uniCode) {
      const c = cohort(m.academicYear);
      await q(
        `INSERT INTO student_profiles (member_id, university_id, major, cohort_label, enrollment_year, expected_graduation_year, student_code)
         SELECT $1, u.id, $3, $4, $5, $6, $7 FROM universities u WHERE u.code = $2`,
        [mem.id, uniCode, m.major ?? null, m.academicYear ?? null, c.from, c.to, m.studentCode ?? null]
      );
    }

    // Chức danh trong nhiệm kỳ hiện hành (nguồn của "authorRole" trên giao diện)
    if (acc.position) {
      await q(
        `INSERT INTO member_positions (member_id, position_id, board_term_id, responsibilities, starts_on, created_by)
         SELECT $1, p.id, $2, $3, DATE '2026-08-15', $4 FROM positions p WHERE p.code = $5`,
        [mem.id, term, m.duty ?? null, ids.user[2], acc.position]
      );
    }

    // Phân phòng
    if (m.room && m.room.startsWith("P.")) {
      await q(
        `INSERT INTO room_assignments (member_id, room_id, academic_year_id, starts_on, reason, assigned_by)
         SELECT $1, r.id, $2, GREATEST($3::date, DATE '2026-08-15'), 'Xếp phòng đầu năm học 2026 – 2027', $4 FROM rooms r WHERE r.code = $5`,
        [mem.id, year, joinedOn(m.joined), ids.user[2], m.room]
      );
    }
  }

  // Một đơn đăng ký đang chờ duyệt để màn hình "Đơn chờ duyệt" có dữ liệu
  const [pending] = await q(
    `INSERT INTO users (email, password_hash, password_changed_at, status) VALUES ('an.tran@luuxa.local', $1, now(), 'invited') RETURNING id`,
    [pwHash]
  );
  await ctx.as(pending.id);
  await q(
    `INSERT INTO member_applications (user_id, full_name, email, phone_e164, university_name, message)
     VALUES ($1, 'Giuse Trần Hoài An', 'an.tran@luuxa.local', '+84987001122', 'Đại học Bách Khoa Hà Nội',
             'Con là sinh viên năm nhất K71, giáo xứ Hàm Long. Xin được vào ở lưu xá năm học 2026 – 2027.')`,
    [pending.id]
  );
  await ctx.as(ids.user[2]);

  ctx.accounts = [
    ...mock.INITIAL_MEMBERS.map((m) => ({ email: ACCOUNTS[m.id].email, name: m.fullName, roles: ACCOUNTS[m.id].roles.join(", ") })),
    { email: "an.tran@luuxa.local", name: "Giuse Trần Hoài An", roles: "(đơn chờ duyệt)" },
  ];
}

/** Nạp lại ctx.ids từ DB (khi chạy seed một phân hệ riêng lẻ: --only <tên>). */
export async function loadIds(ctx) {
  const { q, mock, ids } = ctx;
  ids.user = {};
  ids.member = {};
  ids.memberByName = {};
  ids.memberByFullName = {};
  ids.userByRole = {};
  for (const m of mock.INITIAL_MEMBERS) {
    const acc = ACCOUNTS[m.id];
    const r = (await q("SELECT u.id AS uid, m.id AS mid FROM users u JOIN members m ON m.user_id = u.id WHERE u.email = $1", [acc.email]))[0];
    if (!r) throw new Error(`Chưa có dữ liệu người dùng ${acc.email} — chạy seed đầy đủ trước`);
    ids.user[m.id] = r.uid;
    ids.member[m.id] = r.mid;
    ids.memberByName[m.name] = r.mid;
    ids.memberByFullName[m.fullName] = r.mid;
    for (const role of acc.roles) ids.userByRole[role] ??= r.uid;
  }
  await ctx.as(ids.user[2]);
}
