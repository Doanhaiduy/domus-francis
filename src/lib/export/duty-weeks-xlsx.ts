"use client";

// Xuất LỊCH TRỰC VỆ SINH SÂN NHÀ ra Excel (.xlsx) — chạy trong trình duyệt:
//   • "Lich truc"      — mỗi tuần một dòng: người trực, ghi chú, kết quả đánh giá (điểm, xếp loại, nhận xét, trực lại);
//   • "Theo thanh vien" — mỗi người: số tuần trực, số tuần đã chấm, điểm trung bình, số lần phải trực lại, tuần gần nhất / sắp tới.
import type { DutyHistoryDto, DutyWeekEntryDto } from "@/lib/types/duty";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const vnDateTime = (isoTs: string) => {
  const d = new Date(new Date(isoTs).getTime() + 7 * 3600e3).toISOString();
  return `${dmy(d.slice(0, 10))} ${d.slice(11, 16)}`;
};
/** Cùng mức với vòng điểm ở Hậu cần → Trực vệ sinh */
export const dutyScoreLabel = (s: number) => (s >= 10 ? "Xuất sắc" : s >= 8 ? "Tốt" : s >= 5 ? "Đạt" : "Chưa đạt");

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const num = (value: number | null | undefined, extra: Record<string, unknown> = {}): Cell =>
  value === null || value === undefined ? { value: "", type: String } : { value, type: Number, align: "center", ...extra };

const phase = (w: DutyWeekEntryDto, today: string) => (w.weekEnd < today ? "Đã qua" : w.weekStart <= today ? "Tuần này" : "Sắp tới");
const SCORE_BG = (s: number) => (s >= 8 ? "#D1FAE5" : s >= 5 ? "#FEF3C7" : "#FFE4E6");

export async function downloadDutyWeeksXlsx(h: DutyHistoryDto) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const weeks = h.weeks.filter((w) => w.members.length > 0);

  const cols = ["STT", "Tuần", "Tình trạng", "Người trực 1", "Phòng", "Người trực 2", "Phòng", "Ghi chú", "Điểm (0–10)", "Xếp loại", "Nhận xét", "Trực lại", "Việc cần làm lại", "Người đánh giá", "Lúc đánh giá"];
  const title: Cell[] = [{ value: `LỊCH TRỰC VỆ SINH SÂN NHÀ ${dmy(h.from)} – ${dmy(h.to)}`, fontWeight: "bold", fontSize: 14, columnSpan: cols.length }, ...Array(cols.length - 1).fill(null)];
  const sub: Cell[] = [
    { value: `${h.houseName ? `${h.houseName} · ` : ""}${weeks.length} tuần có lịch · lập ngày ${dmy(h.today)}`, color: "#4B5563", columnSpan: cols.length },
    ...Array(cols.length - 1).fill(null),
  ];
  const rows: Cell[][] = weeks.map((w, i) => {
    const [a, b] = w.members;
    const r = w.review;
    return [
      num(i + 1),
      txt(`${dm(w.weekStart)} – ${dmy(w.weekEnd)}`),
      txt(phase(w, h.today), { align: "center" }),
      txt(a?.fullName),
      txt(a?.room ?? "", { align: "center" }),
      txt(b?.fullName ?? ""),
      txt(b?.room ?? "", { align: "center" }),
      txt(w.note, { wrap: true }),
      r ? num(r.score, { fontWeight: "bold", backgroundColor: SCORE_BG(r.score) }) : txt(w.weekEnd < h.today ? "Chưa chấm" : "", { color: "#9CA3AF", align: "center" }),
      txt(r ? dutyScoreLabel(r.score) : ""),
      txt(r?.comment, { wrap: true }),
      txt(r ? (r.redoRequired ? "Có" : "Không") : "", r?.redoRequired ? { color: "#BE123C", fontWeight: "bold", align: "center" } : { align: "center" }),
      txt(r?.redoRequired ? r.redoNote : "", { wrap: true }),
      txt(r?.reviewerName),
      txt(r ? vnDateTime(r.reviewedAt) : ""),
    ];
  });

  // ---------------- Theo thành viên ----------------
  type Agg = { name: string; room: string | null; weeks: number; reviewed: number; sum: number; redo: number; last: string | null; next: string | null };
  const by = new Map<string, Agg>();
  for (const w of weeks) {
    for (const m of w.members) {
      const g = by.get(m.id) ?? { name: m.fullName, room: m.room, weeks: 0, reviewed: 0, sum: 0, redo: 0, last: null, next: null };
      g.weeks++;
      if (w.review) {
        g.reviewed++;
        g.sum += w.review.score;
        if (w.review.redoRequired) g.redo++;
      }
      if (w.weekStart <= h.today) g.last = !g.last || w.weekStart > g.last ? w.weekStart : g.last;
      else g.next = !g.next || w.weekStart < g.next ? w.weekStart : g.next;
      by.set(m.id, g);
    }
  }
  const people = [...by.values()].sort((x, y) => y.weeks - x.weeks || x.name.localeCompare(y.name, "vi"));
  const pHead = ["Họ và tên", "Phòng", "Số tuần trực", "Đã chấm", "Điểm TB", "Phải trực lại", "Tuần gần nhất", "Tuần sắp tới"];
  const pRows: Cell[][] = people.map((g) => [
    txt(g.name),
    txt(g.room ?? "", { align: "center" }),
    num(g.weeks),
    num(g.reviewed),
    g.reviewed ? num(Math.round((g.sum / g.reviewed) * 10) / 10, { format: "0.0" }) : txt("—", { align: "center" }),
    num(g.redo, g.redo ? { color: "#BE123C", fontWeight: "bold" } : {}),
    txt(g.last ? dm(g.last) : ""),
    txt(g.next ? dm(g.next) : ""),
  ]);

  const sheets = [
    {
      data: [title, sub, [], cols.map((c) => head(c)), ...rows],
      sheet: "Lich truc",
      columns: [{ width: 5 }, { width: 22 }, { width: 11 }, { width: 24 }, { width: 8 }, { width: 24 }, { width: 8 }, { width: 30 }, { width: 10 }, { width: 11 }, { width: 36 }, { width: 9 }, { width: 28 }, { width: 18 }, { width: 17 }],
      stickyRowsCount: 4,
    },
    { data: [pHead.map((c) => head(c, "#D1FAE5")), ...pRows], sheet: "Theo thanh vien", columns: [{ width: 26 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 13 }], stickyRowsCount: 1 },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Lich_truc_ve_sinh_${h.from}_${h.to}.xlsx`);
}
