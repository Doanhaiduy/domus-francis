"use client";

// Xuất BẢNG ĐÓNG QUỸ THEO NGƯỜI ra Excel (.xlsx) — chạy hoàn toàn trong trình duyệt, từ dữ liệu ma trận đóng quỹ đã tải (RLS: người xem được
// cả nhà mới có đủ các dòng; thành viên thường chỉ có dòng của mình):
//   • "Theo nguoi": mỗi thành viên một dòng × mỗi khoản thu hai cột (phải đóng / đã đóng) + tổng phải đóng / đã đóng / còn nợ; tô màu theo trạng thái
//   • "Chi tiet": mỗi khoản phải thu một dòng (miễn giảm, còn lại, trạng thái, ngày nộp gần nhất, hình thức) — để lọc / sắp xếp
//   • "Theo khoan": mỗi khoản thu một dòng (mức, số người, đã xong, phải thu, đã thu, tỷ lệ)
import {
  CONTRIBUTION_STATUS_LABEL,
  FEE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  monthRangeLabel,
  type ContributionCellDto,
  type ContributionPlanDto,
  type ContributionRowDto,
} from "@/lib/types/finance";

const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true, bottomBorderStyle: "thin" });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const money = (value: number, extra: Record<string, unknown> = {}): Cell => ({ value, type: Number, format: "#,##0", align: "right", ...extra });
const int = (value: number, extra: Record<string, unknown> = {}): Cell => ({ value, type: Number, align: "center", ...extra });

/** Màu nền theo trạng thái khoản (giống ô ma trận trên web). */
function tone(c: ContributionCellDto): string | undefined {
  if (c.status === "paid") return "#D1FAE5";
  if (c.status === "waived") return "#E0F2FE";
  if (c.status === "partial") return "#FEF3C7";
  if (c.status === "unpaid" && c.overdue) return "#FFE4E6";
  return undefined;
}

const periodOf = (p: ContributionPlanDto) => (p.feeType === "periodic_dues" ? monthRangeLabel(p.month, p.endMonth) : `T${Number(p.month.slice(5, 7))}/${p.month.slice(0, 4)}`);

export interface DuesExportInput {
  /** Tiêu đề, vd. "Quỹ kỳ T7–T12/2026" hoặc "Năm 2026" */
  title: string;
  plans: ContributionPlanDto[];
  rows: ContributionRowDto[];
  houseName?: string | null;
}

/** Dòng chi tiết (người × khoản) — tách riêng để tái dùng / kiểm thử. */
export function duesDetailRows(plans: ContributionPlanDto[], rows: ContributionRowDto[]) {
  const out: { row: ContributionRowDto; plan: ContributionPlanDto; cell: ContributionCellDto }[] = [];
  for (const r of rows) for (const p of plans) if (r.cells[p.id]) out.push({ row: r, plan: p, cell: r.cells[p.id] });
  return out;
}

export async function downloadDuesXlsx({ title, plans, rows, houseName }: DuesExportInput) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const people = rows.filter((r) => plans.some((p) => r.cells[p.id]));
  const generated = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  // ---- Theo người (ma trận)
  const matrix: Cell[][] = [
    [{ value: `${houseName ? `${houseName} — ` : ""}BẢNG ĐÓNG QUỸ THEO NGƯỜI — ${title}`, fontWeight: "bold", fontSize: 13 }],
    [{ value: `Xuất lúc ${generated}. Màu: xanh = đã đóng · vàng = đóng một phần · hồng = quá hạn · xanh nhạt = được miễn.`, fontSize: 9, textColor: "#6B7280" }],
    [],
    [
      head("STT"),
      head("Họ tên"),
      head("Phòng"),
      ...plans.flatMap((p) => [head(`${p.shortLabel} — phải đóng`), head(`${p.shortLabel} — đã đóng`)]),
      head("Tổng phải đóng", "#DDD6FE"),
      head("Tổng đã đóng", "#DDD6FE"),
      head("Còn nợ", "#FECDD3"),
    ],
  ];
  const colDue = plans.map(() => 0);
  const colPaid = plans.map(() => 0);
  let sumDue = 0;
  let sumPaid = 0;
  let sumOwe = 0;
  people.forEach((r, i) => {
    let due = 0;
    let paid = 0;
    const cells: Cell[] = [];
    plans.forEach((p, k) => {
      const c = r.cells[p.id];
      if (!c) {
        cells.push(txt("—", { align: "center", textColor: "#9CA3AF" }), txt("—", { align: "center", textColor: "#9CA3AF" }));
        return;
      }
      const bg = tone(c);
      cells.push(money(c.netDueVnd, bg ? { backgroundColor: bg } : {}), money(c.paidVnd, bg ? { backgroundColor: bg } : {}));
      due += c.netDueVnd;
      paid += c.paidVnd;
      colDue[k] += c.netDueVnd;
      colPaid[k] += c.paidVnd;
    });
    const owe = Math.max(0, due - paid);
    sumDue += due;
    sumPaid += paid;
    sumOwe += owe;
    matrix.push([int(i + 1), txt(r.fullName), txt(r.room ?? "Chưa xếp phòng"), ...cells, money(due), money(paid), money(owe, owe > 0 ? { textColor: "#BE123C", fontWeight: "bold" } : {})]);
  });
  matrix.push([
    null,
    { value: "TỔNG CỘNG", fontWeight: "bold" },
    null,
    ...plans.flatMap((_, k) => [money(colDue[k], { fontWeight: "bold", backgroundColor: "#EDE9FE" }), money(colPaid[k], { fontWeight: "bold", backgroundColor: "#EDE9FE" })]),
    money(sumDue, { fontWeight: "bold", backgroundColor: "#EDE9FE" }),
    money(sumPaid, { fontWeight: "bold", backgroundColor: "#EDE9FE" }),
    money(sumOwe, { fontWeight: "bold", backgroundColor: "#FFE4E6" }),
  ]);

  // ---- Chi tiết (người × khoản)
  const details = duesDetailRows(plans, people);
  const detail: Cell[][] = [
    [
      "STT",
      "Họ tên",
      "Phòng",
      "Khoản thu",
      "Mã khoản",
      "Loại",
      "Hạn nộp",
      "Phải thu (đ)",
      "Miễn/giảm (đ)",
      "Phải đóng (đ)",
      "Đã đóng (đ)",
      "Còn lại (đ)",
      "Trạng thái",
      "Ngày nộp gần nhất",
      "Hình thức",
      "Lý do miễn/giảm",
    ].map((h) => head(h)),
    ...details.map(({ row, plan, cell }, i): Cell[] => {
      const last = cell.payments[cell.payments.length - 1];
      const st = cell.overdue && (cell.status === "unpaid" || cell.status === "partial") ? `${CONTRIBUTION_STATUS_LABEL[cell.status]} — quá hạn` : CONTRIBUTION_STATUS_LABEL[cell.status];
      const bg = tone(cell);
      return [
        int(i + 1),
        txt(row.fullName),
        txt(row.room ?? ""),
        txt(plan.name),
        txt(plan.code),
        txt(FEE_TYPE_LABEL[plan.feeType] ?? plan.feeType),
        txt(dmy(cell.dueDate)),
        money(cell.amountDueVnd),
        money(cell.discountVnd),
        money(cell.netDueVnd),
        money(cell.paidVnd),
        money(cell.remainingVnd, cell.remainingVnd > 0 ? { textColor: "#BE123C" } : {}),
        txt(st, bg ? { backgroundColor: bg } : {}),
        txt(last ? dmy(last.paidOn) : ""),
        txt(last ? PAYMENT_METHOD_LABEL[last.method] : ""),
        txt(cell.discountReason),
      ];
    }),
  ];

  // ---- Theo khoản
  const byPlan: Cell[][] = [
    ["Khoản thu", "Mã khoản", "Loại", "Kỳ / tháng", "Hạn nộp", "Mức chung (đ/người)", "Số người", "Đã xong", "Còn nợ (người)", "Phải thu (đ)", "Đã thu (đ)", "Tỷ lệ (%)"].map((h) => head(h)),
    ...plans.map((p): Cell[] => {
      const cs = people.map((r) => r.cells[p.id]).filter(Boolean) as ContributionCellDto[];
      const expected = cs.reduce((s, c) => s + c.netDueVnd, 0);
      const collected = cs.reduce((s, c) => s + c.paidVnd, 0);
      const done = cs.filter((c) => c.status === "paid" || c.status === "waived").length;
      const owing = cs.filter((c) => c.status === "unpaid" || c.status === "partial").length;
      return [
        txt(p.name),
        txt(p.code),
        txt(FEE_TYPE_LABEL[p.feeType] ?? p.feeType),
        txt(periodOf(p)),
        txt(dmy(p.dueDate)),
        money(p.amountVnd),
        int(cs.length),
        int(done),
        int(owing, owing > 0 ? { textColor: "#BE123C" } : {}),
        money(expected),
        money(collected),
        expected > 0 ? { value: Math.round((collected / expected) * 1000) / 10, type: Number, format: "0.0", align: "right" } : txt(""),
      ];
    }),
  ];

  const sheets = [
    {
      data: matrix,
      sheet: "Theo nguoi",
      columns: [{ width: 6 }, { width: 26 }, { width: 10 }, ...plans.flatMap(() => [{ width: 13 }, { width: 13 }]), { width: 15 }, { width: 15 }, { width: 13 }],
      stickyRowsCount: 4,
    },
    {
      data: detail,
      sheet: "Chi tiet",
      columns: [{ width: 6 }, { width: 26 }, { width: 10 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 30 }],
      stickyRowsCount: 1,
    },
    {
      data: byPlan,
      sheet: "Theo khoan",
      columns: [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 10 }],
      stickyRowsCount: 1,
    },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Bang_dong_quy_${slug(title)}.xlsx`);
}
