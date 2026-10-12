"use client";

// Xuất BÁO CÁO ĐI LỄ (check-in đi lễ) theo khoảng ngày ra Excel (.xlsx), chạy hoàn toàn trong trình duyệt:
//   • "Tong hop"  — mỗi thành viên một dòng: số lễ phải tính, đã đi (xác nhận / chờ duyệt), vắng, tỉ lệ;
//   • "Chi tiet"  — bảng thành viên × ngày lễ bắt buộc (✓ đã xác nhận · ⏳ chờ duyệt · ✗ vắng / chưa hợp lệ · … còn hạn · trống = chưa ở nhà);
//   • "Theo ngay" — mỗi ngày lễ một dòng: dịp, cần ảnh, số người phải đi, đã check-in, chờ duyệt.
import type { MassReportCell, MassReportDto } from "@/lib/types/liturgy";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const n = (value: number, extra: Record<string, unknown> = {}): Cell => ({ value, type: Number, align: "right", ...extra });
const pct = (num: number, den: number): Cell => (den > 0 ? { value: num / den, type: Number, format: "0.0%", align: "right" } : { value: "—", align: "center" });

const CELL: Record<MassReportCell, { text: string; bg?: string; color?: string }> = {
  approved: { text: "✓", bg: "#D1FAE5", color: "#047857" },
  submitted: { text: "⏳", bg: "#FEF3C7", color: "#92400E" },
  rejected: { text: "✗ KHL", bg: "#FFE4E6", color: "#BE123C" },
  none: { text: "✗", bg: "#FFE4E6", color: "#BE123C" },
  open: { text: "…", color: "#6B7280" },
  na: { text: "", bg: "#F3F4F6" },
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export async function downloadMassReportXlsx(r: MassReportDto, houseName?: string | null) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const period = `${dmy(r.from)} – ${dmy(r.to)}`;
  const title = (t: string, span: number): Cell[] => [{ value: t, fontWeight: "bold", fontSize: 14, columnSpan: span }, ...Array(Math.max(span - 1, 0)).fill(null)];
  const line = (t: string, span: number): Cell[] => [{ value: t, color: "#4B5563", columnSpan: span }, ...Array(Math.max(span - 1, 0)).fill(null)];

  // ---------------- Tổng hợp ----------------
  const sumHead = ["STT", "Họ và tên", "Phòng", "Lễ phải tính", "Đã xác nhận", "Chờ duyệt", "Vắng", "Tỉ lệ đi lễ", "Ngày vắng"];
  const totals = r.members.reduce((t, m) => ({ req: t.req + m.required, ok: t.ok + m.approved, wait: t.wait + m.pending, miss: t.miss + m.missed }), { req: 0, ok: 0, wait: 0, miss: 0 });
  const summary: Cell[][] = [
    title(`BÁO CÁO ĐI LỄ ${period}`, sumHead.length),
    line(`${houseName ? `${houseName} · ` : ""}${r.days.length} ngày lễ bắt buộc đã đến · ${r.members.length} thành viên · lập ngày ${dmy(r.today)}`, sumHead.length),
    line("Lễ phải tính = đã check-in (xác nhận hoặc chờ duyệt) + vắng. Ngày còn trong hạn check-in mà chưa check-in chưa tính là vắng.", sumHead.length),
    [],
    sumHead.map((h) => head(h)),
    ...r.members.map((m, i): Cell[] => [
      n(i + 1, { align: "center" }),
      txt(m.fullName),
      txt(m.room),
      n(m.required),
      n(m.approved),
      n(m.pending),
      n(m.missed, m.missed ? { color: "#BE123C", fontWeight: "bold" } : {}),
      pct(m.attended, m.required),
      txt(m.missing.map(dm).join(", "), { wrap: true }),
    ]),
    [
      null,
      txt("Cả nhà", { fontWeight: "bold" }),
      null,
      n(totals.req, { fontWeight: "bold" }),
      n(totals.ok, { fontWeight: "bold" }),
      n(totals.wait, { fontWeight: "bold" }),
      n(totals.miss, { fontWeight: "bold" }),
      pct(totals.ok + totals.wait, totals.req),
      null,
    ],
  ];

  // ---------------- Chi tiết (thành viên × ngày) ----------------
  const detailHead: Cell[] = [
    head("Họ và tên"),
    head("Phòng"),
    ...r.days.map((d) => head(`${weekday(d.date)} ${dm(d.date)}\n${d.label}${d.evidenceRequired ? " 📷" : ""}`, d.evidenceRequired ? "#FEF3C7" : "#EDE9FE")),
    head("Đã đi"),
    head("Vắng"),
  ];
  const detail: Cell[][] = [
    title(`CHI TIẾT ĐI LỄ ${period}`, Math.min(detailHead.length, 12)),
    line("✓ đã xác nhận · ⏳ chờ duyệt · ✗ vắng · ✗ KHL check-in chưa hợp lệ · … còn hạn check-in · ô xám = chưa ở nhà / đã rời nhà · 📷 ngày cần ảnh minh chứng", Math.min(detailHead.length, 12)),
    [],
    detailHead,
    ...r.members.map((m): Cell[] => [
      txt(m.fullName),
      txt(m.room),
      ...m.cells.map((c): Cell => {
        const s = CELL[c];
        return { value: s.text, type: String, align: "center", ...(s.bg ? { backgroundColor: s.bg } : {}), ...(s.color ? { color: s.color } : {}) };
      }),
      { value: `${m.attended}/${m.required}`, type: String, align: "center", fontWeight: "bold" },
      n(m.missed, m.missed ? { color: "#BE123C", fontWeight: "bold", align: "center" } : { align: "center" }),
    ]),
  ];

  // ---------------- Theo ngày ----------------
  const dayHead = ["Ngày", "Thứ", "Dịp", "Tên lễ", "Cần ảnh", "Hạn check-in", "Phải đi", "Đã check-in", "Chờ duyệt", "Chưa / vắng"];
  const byDay: Cell[][] = [
    dayHead.map((h) => head(h)),
    ...r.days.map((d): Cell[] => [
      txt(dmy(d.date)),
      txt(weekday(d.date), { align: "center" }),
      txt(d.label),
      txt(d.title, { wrap: true }),
      txt(d.evidenceRequired ? "Có" : "Không", { align: "center" }),
      txt(dmy(d.deadline)),
      n(d.expected),
      n(d.checkedIn),
      n(d.pending),
      n(Math.max(d.expected - d.checkedIn, 0)),
    ]),
  ];

  const sheets = [
    { data: summary, sheet: "Tong hop", columns: [{ width: 6 }, { width: 28 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 40 }], stickyRowsCount: 5 },
    { data: detail, sheet: "Chi tiet", columns: [{ width: 26 }, { width: 8 }, ...r.days.map(() => ({ width: 11 })), { width: 9 }, { width: 8 }], stickyRowsCount: 4, stickyColumnsCount: 1 },
    { data: byDay, sheet: "Theo ngay", columns: [{ width: 12 }, { width: 6 }, { width: 18 }, { width: 40 }, { width: 9 }, { width: 13 }, { width: 9 }, { width: 12 }, { width: 11 }, { width: 12 }], stickyRowsCount: 1 },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Bao_cao_di_le_${slug(`${dm(r.from)}_${dmy(r.to)}`)}.xlsx`);
}
