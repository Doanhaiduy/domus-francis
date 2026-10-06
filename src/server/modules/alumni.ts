import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { notFound } from "../errors";
import { permissions } from "./community-shared";
import { listMembers } from "./members";
import type { AlumniDto, AlumniInput, AlumniListDto } from "@/lib/types/alumni";

// Mạng lưới cựu thành viên: danh bạ người đã ra trường / rời lưu xá + hồ sơ nghề nghiệp (alumni_profiles — RLS quyết định ai thấy gì).

const opt = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
export const AlumniSchema = z.object({
  graduationYear: z.number().int().min(1980, "Năm ra trường không hợp lệ.").max(2100, "Năm ra trường không hợp lệ.").nullable().optional().transform((v) => v ?? null),
  occupation: opt(120),
  workplace: opt(200),
  city: opt(100),
  keepsContact: z.boolean().optional().transform((v) => !!v),
  note: opt(500),
});

type Row = Record<string, any>;
const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function listAlumni(tx: Tx): Promise<AlumniListDto> {
  const [members, extra, perm, meRow] = await Promise.all([
    listMembers(tx, { includeFormer: true }),
    tx
      .query(
        `SELECT m.id, m.left_on, m.left_reason, ap.graduation_year, ap.occupation, ap.workplace, ap.city, ap.keeps_contact, ap.note
           FROM members m LEFT JOIN alumni_profiles ap ON ap.member_id = m.id
          WHERE m.deleted_at IS NULL AND m.status IN ('alumni', 'left')`
      )
      .then((r) => new Map(r.rows.map((x: Row) => [x.id as string, x]))),
    permissions(tx, ["member.update"] as const),
    tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id").then((r) => r.rows[0]?.id ?? null),
  ]);
  const canManage = !!perm["member.update"];
  const items: AlumniDto[] = members
    .filter((m) => m.status === "alumni" || m.status === "left")
    .map((m) => {
      const x = extra.get(m.id) ?? {};
      return {
        id: m.id,
        name: m.name,
        fullName: m.fullName,
        status: m.status as "alumni" | "left",
        avatarUrl: m.avatarUrl,
        leftOn: iso(x.left_on),
        leftReason: canManage ? (x.left_reason ?? null) : null,
        joinedOn: m.joinedOn,
        university: m.university ?? null,
        major: m.major ?? null,
        phone: m.phone,
        email: m.email ?? null,
        graduationYear: x.graduation_year ?? null,
        occupation: x.occupation ?? null,
        workplace: x.workplace ?? null,
        city: x.city ?? null,
        keepsContact: !!x.keeps_contact,
        note: x.note ?? null,
        canEdit: canManage || meRow === m.id,
      };
    })
    // Cựu mới rời/ra trường trước; chưa có ngày ⇒ cuối
    .sort((a, b) => (b.leftOn ?? "").localeCompare(a.leftOn ?? "") || a.fullName.localeCompare(b.fullName, "vi"));
  return { items, canManage };
}

export async function saveAlumni(tx: Tx, memberId: string, b: AlumniInput): Promise<void> {
  const m = (await tx.query<{ status: string }>("SELECT status::text AS status FROM members WHERE id = $1 AND deleted_at IS NULL", [memberId])).rows[0];
  if (!m) throw notFound("Không tìm thấy thành viên.");
  const r = await tx.query(
    `INSERT INTO alumni_profiles (member_id, graduation_year, occupation, workplace, city, keeps_contact, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (member_id) DO UPDATE SET graduation_year = EXCLUDED.graduation_year, occupation = EXCLUDED.occupation,
            workplace = EXCLUDED.workplace, city = EXCLUDED.city, keeps_contact = EXCLUDED.keeps_contact, note = EXCLUDED.note`,
    [memberId, b.graduationYear, b.occupation, b.workplace, b.city, b.keepsContact, b.note]
  );
  if (!r.rowCount) throw notFound("Không có quyền sửa hồ sơ cựu này.");
}
