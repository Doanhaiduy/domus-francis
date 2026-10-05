// Seed phân hệ Học tập: bảng điểm theo học kỳ từ INITIAL_ACADEMIC_RECORDS của giao diện cũ.
//  - Học kỳ 1 năm học 2026 – 2027 (học kỳ hiện hành) cho 6 thành viên; bảng điểm của "Lê Minh Tuấn" (tuan.nguyen) đặt ở
//    Học kỳ 2 năm 2025 – 2026 để tài khoản thành viên demo tự nhập bảng điểm học kỳ hiện hành qua giao diện.
//  - Mọi thao tác đi đúng đường nghiệp vụ: chính chủ tạo + nhập điểm thành phần (DB tự tính tổng kết/điểm chữ/GPA),
//    đính kèm ảnh minh chứng do chính mình tải lên, nộp; Phó nhà/Trưởng nhà xác minh hoặc trả lại (app.fn_academic_review).
//  - Ảnh minh chứng: ảnh PNG sinh tại chỗ (không tải từ mạng) ghi vào STORAGE_DIR như luồng /api/v1/files.
//  - memberId "m1".. trong mock KHÔNG phải mã thành viên — tra theo họ tên (memberByFullName, rồi theo tên gọi 2 chữ cuối).
//  - Trường / ngành / MSSV lấy từ hồ sơ sinh viên hiện hành của thành viên (student_profiles; dự phòng INITIAL_MEMBERS → mã
//    trường Hà Nội như people.mjs), KHÔNG dùng các trường TP.HCM của mock học tập cũ; thang điểm = app.fn_scale_for(trường,
//    ngày bắt đầu học kỳ). Môn học, điểm thành phần, nguyện vọng, học bổng, phụ đạo và trạng thái lấy theo mock.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT, loadEnvLocal } from "../env.mjs";

const STORAGE_ROOT = path.resolve(ROOT, process.env.STORAGE_DIR || loadEnvLocal().STORAGE_DIR || ".local/storage");

// Trạng thái demo theo bảng điểm mock (giao diện cũ không có luồng duyệt)
const PLAN = {
  "acad-1": { status: "verified", verifier: "vice_head" }, // Trần Văn Đức (Trưởng nhà) — Phó nhà xác minh
  "acad-2": { status: "verified", verifier: "vice_head", previous: true }, // Lê Minh Tuấn → tuan.nguyen, HK2 2025-2026
  "acad-3": { status: "draft", midtermOnly: ["Cấu tạo kiến trúc"] }, // Lê Hoàng Long (Phó nhà) — đang nhập, còn môn chưa thi cuối kỳ
  "acad-4": { status: "verified", verifier: "vice_head" }, // Phạm Gia Bảo
  "acad-5": { status: "rejected", verifier: "vice_head", reason: "Ảnh minh chứng chưa thấy rõ điểm môn Mạng máy tính — em chụp lại toàn trang giúp anh nhé." },
  "acad-6": { status: "submitted" }, // Đặng Thanh Phong — chờ xác minh, cần phụ đạo
  "acad-7": { status: "verified", verifier: "vice_head" }, // Bùi Văn Hiếu
};

// Môn học hợp với ngành thật của từng thành viên (hồ sơ sinh viên) — thay tên môn của mock theo đúng thứ tự,
// GIỮ NGUYÊN tín chỉ và điểm thành phần của mock (nên GPA/xếp loại tương đương); nguyện vọng/môn cần phụ đạo viết lại cho khớp ngành.
const FIT = {
  // Trần Văn Đức — NEU, Quản trị Kinh doanh Tổng hợp
  "acad-1": {
    subjects: ["Quản trị chiến lược", "Quản trị tài chính doanh nghiệp", "Quản trị nguồn nhân lực", "Tiếng Anh kinh doanh 2"],
    aspirations: "Đặt mục tiêu duy trì học bổng khuyến khích học tập kỳ tới. Sẵn sàng phụ đạo môn Kinh tế vi mô và Nguyên lý kế toán cho các em khóa dưới trong lưu xá.",
  },
  // Nguyễn Minh Tuấn — HUST, Kỹ thuật Điều khiển & Tự động hóa
  "acad-2": {
    subjects: ["Lý thuyết điều khiển tự động", "Kỹ thuật vi xử lý", "Xử lý ảnh trong công nghiệp", "Điều khiển logic & PLC"],
    aspirations: "Duy trì vị trí Top 5 của khoa. Có nguyện vọng mở lớp phụ đạo Tin học văn phòng & Lập trình căn bản cho anh em lưu xá vào tối thứ Ba hàng tuần.",
  },
  // Lê Hoàng Long — HUCE, Kiến trúc & Quy hoạch Đô thị
  "acad-3": {
    subjects: ["Kiến trúc dân dụng 2", "Quy hoạch đô thị", "Cấu tạo kiến trúc", "Vẽ ghi kiến trúc"],
    aspirations: "Học kỳ tới cần cố gắng nâng điểm môn Cấu tạo kiến trúc để đạt bằng Khá loại ưu. Nguyện vọng thi chứng chỉ TOEIC đạt 650 điểm.",
  },
  // Phạm Gia Bảo — FTU, Tài chính Quốc tế & Ngân hàng
  "acad-4": {
    subjects: ["Tài chính doanh nghiệp", "Kinh tế vi mô", "Tài chính quốc tế", "Nghiệp vụ ngân hàng thương mại"],
    aspirations: "Lịch thực tập tại ngân hàng dày, mong ban ẩm thực lưu xá hỗ trợ lưu phần cơm tối khi về muộn. Dự định tham gia CLB Tài chính – Đầu tư của trường.",
  },
  // Vũ Quốc Việt — HUST, Khoa học Máy tính (IT1)
  "acad-5": {
    subjects: ["Cấu trúc dữ liệu & Giải thuật", "Cơ sở dữ liệu", "Mạng máy tính", "Lập trình hướng đối tượng"],
    aspirations: "Cần cải thiện phần thực hành môn Mạng máy tính. Đang hỗ trợ anh Thủ quỹ lưu xá xây bảng tính đối soát thu chi hàng tháng.",
  },
  // Đặng Thanh Phong — HMU, Bác sĩ Đa khoa
  "acad-6": {
    subjects: ["Hóa sinh", "Giải phẫu học 2", "Mô phôi", "Sinh lý học"],
    aspirations: "Gặp khó khăn lớn ở môn Hóa sinh và Sinh lý học. Rất mong Ban điều hành ghép cặp với anh em có kinh nghiệm học khối Y để kèm vào tối thứ Năm.",
    supportSubject: "Hóa sinh & Sinh lý học",
  },
  // Bùi Văn Hiếu — UTC, Logistics & Quản lý Chuỗi Cung Ứng
  "acad-7": {
    subjects: ["Đồ án Thiết kế chuỗi cung ứng", "Quản trị kho hàng", "Vận tải đa phương thức", "Kinh tế vận tải"],
    aspirations: "Đồ án kỳ này được hội đồng khen. Dự định làm đồ án tốt nghiệp về tối ưu chuỗi cung ứng cho một cơ sở bác ái của giáo xứ.",
  },
};
const fitToMajor = (rec) => {
  const fit = FIT[rec.id];
  if (!fit) return rec;
  return {
    ...rec,
    subjects: rec.subjects.map((sub, i) => ({ ...sub, subjectName: fit.subjects[i] ?? sub.subjectName })),
    aspirations: fit.aspirations ?? rec.aspirations,
    supportSubject: fit.supportSubject ?? rec.supportSubject,
  };
};

// Tên trường trong INITIAL_MEMBERS → mã universities (cùng bảng với scripts/db/seed/people.mjs)
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

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmyToIso = (s) => (s && /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.split("/").reverse().join("-") : null);

async function dHash(buf) {
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return BigInt.asIntN(64, h).toString();
}

/** Ảnh "bảng điểm cổng thông tin sinh viên" dựng từ dữ liệu demo (SVG → PNG), cùng định dạng lưu trữ với /api/v1/files. */
async function makeTranscript(ctx, { ownerUserId, rec, semLabel, universityName }) {
  const rows = rec.subjects
    .map((s, i) => {
      const y = 250 + i * 46;
      const fin = s.finalScore === null ? "—" : s.finalScore;
      return `<rect x="40" y="${y - 30}" width="920" height="46" fill="${i % 2 ? "#f8f7ff" : "#ffffff"}"/>
        <text x="60" y="${y}" font-size="20" fill="#111827">${esc(s.subjectName)}</text>
        <text x="610" y="${y}" font-size="20" fill="#374151" text-anchor="middle">${s.credits}</text>
        <text x="720" y="${y}" font-size="20" fill="#5b21b6" text-anchor="middle">${s.midtermScore}</text>
        <text x="840" y="${y}" font-size="20" fill="#3730a3" text-anchor="middle">${fin}</text>`;
    })
    .join("");
  const h = 330 + rec.subjects.length * 46;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}" font-family="Segoe UI, Arial, sans-serif">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect width="100%" height="96" fill="#312e81"/>
    <text x="40" y="44" font-size="26" font-weight="700" fill="#ffffff">${esc(universityName)}</text>
    <text x="40" y="78" font-size="18" fill="#c7d2fe">Cổng thông tin đào tạo — Kết quả học tập ${esc(semLabel)}</text>
    <text x="40" y="140" font-size="21" fill="#111827">Sinh viên: <tspan font-weight="700">${esc(rec.memberName)}</tspan>   •   MSSV: ${esc(rec.studentId)}</text>
    <text x="40" y="172" font-size="18" fill="#4b5563">Ngành: ${esc(rec.major)}</text>
    <rect x="40" y="190" width="920" height="40" fill="#ede9fe"/>
    <text x="60" y="217" font-size="17" font-weight="700" fill="#4c1d95">TÊN HỌC PHẦN</text>
    <text x="610" y="217" font-size="17" font-weight="700" fill="#4c1d95" text-anchor="middle">TC</text>
    <text x="720" y="217" font-size="17" font-weight="700" fill="#4c1d95" text-anchor="middle">QT/GK</text>
    <text x="840" y="217" font-size="17" font-weight="700" fill="#4c1d95" text-anchor="middle">CUỐI KỲ</text>
    ${rows}
    <text x="40" y="${h - 24}" font-size="14" fill="#9ca3af">Ảnh chụp màn hình minh chứng (dữ liệu demo sinh tại máy) • ${esc(randomUUID().slice(0, 8))}</text>
  </svg>`;
  const body = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(body).metadata();
  const sha256 = createHash("sha256").update(body).digest("hex");
  const phash = await dHash(body);
  const [{ id }] = await ctx.q("SELECT app.uuid_v7() AS id");
  const now = new Date(Date.now() + 7 * 3600e3);
  const prefix = `academic-evidence/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = `${prefix}/${id}.png`;
  const variants = {};
  await mkdir(path.join(STORAGE_ROOT, prefix), { recursive: true });
  await writeFile(path.join(STORAGE_ROOT, key), body);
  for (const [name, size] of [["thumb", 360], ["medium", 1280]]) {
    const vkey = `${prefix}/${id}.${name}.webp`;
    await writeFile(
      path.join(STORAGE_ROOT, vkey),
      await sharp(body).resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    );
    variants[name] = vkey;
  }
  await ctx.q(
    `INSERT INTO storage_files (id, bucket, object_key, original_name, declared_mime, detected_mime, size_bytes, sha256, phash,
                                width_px, height_px, exif_stripped, status, scan_status, variants, uploaded_by)
     VALUES ($1, 'academic-evidence', $2, $3, 'image/png', 'image/png', $4, $5, $6::bigint, $7, $8, true, 'ready', 'skipped', $9::jsonb, $10)`,
    [id, key, `bang-diem-${rec.studentId}.png`, body.length, sha256, phash, meta.width, meta.height, JSON.stringify(variants), ownerUserId]
  );
  return id;
}

export async function seed(ctx) {
  const { q, mock, ids } = ctx;
  const records = mock.INITIAL_ACADEMIC_RECORDS ?? [];
  if (!records.length) return;

  const sem = async (year, code) =>
    (
      await q(
        `SELECT s.id, s.starts_on::text AS starts_on, s.name || ' năm học ' || y.code AS label FROM semesters s JOIN academic_years y ON y.id = s.academic_year_id
          WHERE y.code = $1 AND s.code = $2`,
        [year, code]
      )
    )[0];
  const current = await sem("2026-2027", "HK1");
  const previous = await sem("2025-2026", "HK2");

  // members.id → users.id (mock id '1'..'12')
  const userOfMember = {};
  for (const [mockId, mid] of Object.entries(ids.member)) userOfMember[mid] = ids.user[mockId];
  const memberIdOf = (name) => ids.memberByFullName[name] ?? ids.memberByName[name.split(/\s+/).slice(-2).join(" ")];
  const verifierOf = { vice_head: ids.userByRole.vice_head, house_head: ids.userByRole.house_head };

  for (const mockRec of records) {
    const rec = fitToMajor(mockRec);
    const plan = PLAN[rec.id] ?? { status: "draft" };
    const memberId = memberIdOf(rec.memberName);
    if (!memberId) {
      console.warn(`  ! bỏ qua bảng điểm ${rec.id}: không tìm thấy thành viên "${rec.memberName}"`);
      continue;
    }
    const ownerUserId = userOfMember[memberId];
    const semester = plan.previous ? previous : current;
    // Trường/ngành/MSSV theo hồ sơ sinh viên hiện hành (people.mjs tạo từ INITIAL_MEMBERS); dự phòng đọc thẳng INITIAL_MEMBERS
    let study = (
      await q(
        `SELECT u.id, u.name, sp.major, sp.student_code FROM student_profiles sp JOIN universities u ON u.id = sp.university_id
          WHERE sp.member_id = $1 AND sp.is_current AND sp.deleted_at IS NULL LIMIT 1`,
        [memberId]
      )
    )[0];
    if (!study) {
      const mm = mock.INITIAL_MEMBERS.find((x) => ids.member[x.id] === memberId);
      const u = mm && UNI[mm.university] ? (await q("SELECT id, name FROM universities WHERE code = $1", [UNI[mm.university]]))[0] : null;
      if (u) study = { id: u.id, name: u.name, major: mm.major ?? null, student_code: mm.studentCode ?? null };
    }
    if (!study) {
      console.warn(`  ! bỏ qua bảng điểm ${rec.id}: thành viên "${rec.memberName}" chưa có hồ sơ sinh viên`);
      continue;
    }
    const uni = { id: study.id, name: study.name };
    const major = study.major ?? null;
    const studentCode = study.student_code ?? null;
    // Thang điểm hiệu lực của trường tại ngày bắt đầu học kỳ (thang riêng của trường, nếu không có thì thang mặc định)
    const [{ scale_id: scaleId }] = await q("SELECT app.fn_scale_for($1, $2::date) AS scale_id", [uni.id, semester.starts_on]);
    if (!scaleId) {
      console.warn(`  ! bỏ qua bảng điểm ${rec.id}: chưa có thang điểm hiệu lực cho ${uni.name}`);
      continue;
    }
    const createdAt = `${dmyToIso(rec.updatedAt) ?? "2026-09-28"} 20:00:00+07`;

    // 1) Chính chủ tạo bảng điểm nháp + nhập điểm thành phần
    await ctx.as(ownerUserId);
    const [ar] = await q(
      `INSERT INTO academic_records (member_id, semester_id, university_id, scale_id, major_snapshot, student_code_snapshot,
                                     has_scholarship, scholarship_note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [memberId, semester.id, uni.id, scaleId, major, studentCode, !!rec.scholarshipEligible,
       rec.scholarshipEligible ? "Học bổng khuyến khích học tập" : null, createdAt]
    );
    const subjects = rec.subjects.map((s) => ({
      ...s,
      finalScore: plan.midtermOnly?.includes(s.subjectName) ? null : s.finalScore,
    }));
    for (const s of subjects) {
      let [c] = await q(
        `INSERT INTO courses (university_id, name, default_credits) VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT ux_courses__university_name DO NOTHING RETURNING id`,
        [uni.id, s.subjectName, s.credits]
      );
      if (!c) [c] = await q("SELECT id FROM courses WHERE university_id = $1 AND name_norm = app.norm_text($2)", [uni.id, s.subjectName]);
      await q(
        "INSERT INTO grade_records (record_id, course_id, credits, process_score, final_score) VALUES ($1, $2, $3, $4, $5)",
        [ar.id, c.id, s.credits, s.midtermScore, s.finalScore]
      );
    }

    // 2) Ảnh minh chứng do chính chủ tải lên, gắn vào bảng điểm (purpose = transcript)
    if (plan.status !== "draft" || rec.evidencePhoto) {
      const fileId = await makeTranscript(ctx, {
        ownerUserId,
        rec: { ...rec, subjects, major: major ?? "", studentId: studentCode ?? "" },
        semLabel: semester.label,
        universityName: uni.name,
      });
      await q(
        "INSERT INTO media_attachments (file_id, entity_type, entity_id, purpose, attached_by) VALUES ($1, 'academic_record', $2, 'transcript', $3)",
        [fileId, ar.id, ownerUserId]
      );
    }

    // 3) Nguyện vọng (chia sẻ cho Ban điều hành) + yêu cầu phụ đạo
    if (rec.aspirations) {
      await q(
        `INSERT INTO study_goals (member_id, semester_id, goals, visibility) VALUES ($1, $2, $3, 'leadership')
         ON CONFLICT (member_id, semester_id) DO NOTHING`,
        [memberId, semester.id, rec.aspirations]
      );
    }
    if (rec.supportNeeded && rec.supportSubject) {
      await q("INSERT INTO tutoring_requests (mentee_member_id, subject_text, description) VALUES ($1, $2, $3)", [
        memberId,
        rec.supportSubject,
        "Đăng ký khi nhập bảng điểm học kỳ",
      ]);
    }

    // 4) Nộp (trigger kiểm ≥1 môn, đủ tổng kết, có minh chứng ⇒ tính GPA) rồi xác minh / trả lại bởi người có quyền
    if (plan.status === "draft") continue;
    await q("UPDATE academic_records SET status = 'submitted' WHERE id = $1", [ar.id]);
    if (plan.status === "verified") {
      await ctx.as(verifierOf[plan.verifier]);
      await q("UPDATE academic_records SET status = 'verified' WHERE id = $1", [ar.id]);
    } else if (plan.status === "rejected") {
      await ctx.as(verifierOf[plan.verifier]);
      await q("SELECT app.fn_academic_review($1, 'reject', $2)", [ar.id, plan.reason]);
    }
  }

  // Các seed sau chạy dưới tên Trưởng nhà như mặc định
  await ctx.as(ids.user[2]);
}
