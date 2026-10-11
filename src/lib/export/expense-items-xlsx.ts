"use client";

// Xuất BẢNG KÊ CHI TIẾT các phiếu đã chi trong kỳ ra Excel (.xlsx), chạy hoàn toàn trong trình duyệt:
//   • "Chi tiet tung mon": mỗi món một dòng (ngày chi, số phiếu, nội dung phiếu, phân loại, món, số lượng, đơn vị, đơn giá, thành tiền, người ứng/chi).
//     Phiếu chi một khoản (không có món) hiện MỘT dòng với tên phiếu làm "món" để tổng cột Thành tiền khớp tổng chi.
//   • "Theo phieu chi": mỗi phiếu một dòng (số món, tổng, người ứng/chi, hình thức, ghi chú).
//   • "Tong hop theo mon": cộng dồn theo tên món + đơn vị (vd. tháng này đã mua bao nhiêu kg thịt heo, hết bao nhiêu tiền).
// Chỉ lấy phiếu ĐÃ CHI (trạng thái paid); phiếu đã đảo/hủy/đang duyệt không tính.
import { EXPENSE_STATUS_LABEL, PAYMENT_METHOD_LABEL, type ExpenseDto } from "@/lib/types/finance";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
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
const qty = (value: number | null): Cell => (value === null ? { value: "", type: String } : { value, type: Number, format: "#,##0.###", align: "right" });

export interface ExpenseItemsExportRow {
  date: string;
  voucherNo: string;
  voucherTitle: string;
  category: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  unitPriceVnd: number | null;
  amountVnd: number;
  payer: string;
}

/** Dòng chi tiết từ các phiếu ĐÃ CHI (tách riêng để kiểm thử/tái dùng). */
export function buildExpenseItemRows(expenses: ExpenseDto[]): ExpenseItemsExportRow[] {
  const paid = expenses.filter((e) => e.status === "paid").sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.voucherNo.localeCompare(b.voucherNo));
  return paid.flatMap((e): ExpenseItemsExportRow[] => {
    const payer = e.paidBy?.name ?? "Quỹ chi trực tiếp";
    if (!e.items.length) return [{ date: e.expenseDate, voucherNo: e.voucherNo, voucherTitle: e.title, category: e.category.name, item: e.title, quantity: null, unit: null, unitPriceVnd: null, amountVnd: e.amountVnd, payer }];
    return e.items.map((i) => ({ date: e.expenseDate, voucherNo: e.voucherNo, voucherTitle: e.title, category: e.category.name, item: i.name, quantity: i.quantity, unit: i.unit, unitPriceVnd: i.unitPriceVnd, amountVnd: i.amountVnd, payer }));
  });
}

/** Cộng dồn theo (tên món không phân biệt hoa/thường + đơn vị). Chỉ tính phiếu có món. */
export function aggregateItems(expenses: ExpenseDto[]): { name: string; unit: string; quantity: number; amountVnd: number; times: number }[] {
  const map = new Map<string, { name: string; unit: string; quantity: number; amountVnd: number; times: number }>();
  for (const e of expenses.filter((x) => x.status === "paid")) {
    for (const i of e.items) {
      const unit = (i.unit ?? "").trim();
      const key = `${i.name.trim().toLowerCase()}|${unit.toLowerCase()}`;
      const cur = map.get(key) ?? { name: i.name.trim(), unit, quantity: 0, amountVnd: 0, times: 0 };
      cur.quantity += i.quantity;
      cur.amountVnd += i.amountVnd;
      cur.times += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.amountVnd - a.amountVnd);
}

export async function downloadExpenseItemsXlsx(expenses: ExpenseDto[], periodLabel: string) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const paid = expenses.filter((e) => e.status === "paid");
  const rows = buildExpenseItemRows(expenses);
  const total = rows.reduce((s, r) => s + r.amountVnd, 0);

  const detail = [
    [{ value: `BẢNG KÊ CHI TIẾT CÁC KHOẢN ĐÃ CHI — ${periodLabel}`, fontWeight: "bold", fontSize: 13 }],
    [],
    ["Ngày chi", "Số phiếu", "Nội dung phiếu", "Phân loại", "Tên món", "Số lượng", "Đơn vị", "Đơn giá (đ)", "Thành tiền (đ)", "Người ứng / chi"].map((h) => head(h)),
    ...rows.map((r): Cell[] => [
      txt(dmy(r.date)),
      txt(r.voucherNo),
      txt(r.voucherTitle),
      txt(r.category),
      txt(r.item),
      qty(r.quantity),
      txt(r.unit),
      r.unitPriceVnd === null ? txt("") : money(r.unitPriceVnd),
      money(r.amountVnd),
      txt(r.payer),
    ]),
    [null, null, null, null, null, null, null, { value: "TỔNG CỘNG", fontWeight: "bold", align: "right" }, money(total, { fontWeight: "bold", backgroundColor: "#EDE9FE" }), null],
  ];

  const byVoucher = [
    ["Ngày chi", "Số phiếu", "Nội dung phiếu", "Phân loại", "Số món", "Tổng tiền (đ)", "Người ứng / chi", "Hình thức chi", "Trạng thái", "Ghi chú"].map((h) => head(h)),
    ...paid
      .slice()
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.voucherNo.localeCompare(b.voucherNo))
      .map((e): Cell[] => [
        txt(dmy(e.expenseDate)),
        txt(e.voucherNo),
        txt(e.title),
        txt(e.category.name),
        { value: e.items.length, type: Number, align: "center" },
        money(e.amountVnd),
        txt(e.paidBy?.name ?? "Quỹ chi trực tiếp"),
        txt(e.paymentMethod ? PAYMENT_METHOD_LABEL[e.paymentMethod] : ""),
        txt(EXPENSE_STATUS_LABEL[e.status]),
        txt(e.note),
      ]),
  ];

  const agg = aggregateItems(expenses);
  const byItem = [
    ["Tên món", "Đơn vị", "Tổng số lượng", "Tổng tiền (đ)", "Số lần mua"].map((h) => head(h)),
    ...agg.map((a): Cell[] => [txt(a.name), txt(a.unit), qty(a.quantity), money(a.amountVnd), { value: a.times, type: Number, align: "center" }]),
  ];

  const sheets: unknown[] = [
    { data: detail, sheet: "Chi tiet tung mon", columns: [{ width: 12 }, { width: 18 }, { width: 34 }, { width: 22 }, { width: 28 }, { width: 11 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 22 }], stickyRowsCount: 3 },
    { data: byVoucher, sheet: "Theo phieu chi", columns: [{ width: 12 }, { width: 18 }, { width: 36 }, { width: 22 }, { width: 9 }, { width: 16 }, { width: 22 }, { width: 16 }, { width: 14 }, { width: 36 }], stickyRowsCount: 1 },
  ];
  if (agg.length) sheets.push({ data: byItem, sheet: "Tong hop theo mon", columns: [{ width: 32 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 11 }], stickyRowsCount: 1 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Bang_ke_chi_tiet_${slug(periodLabel)}.xlsx`);
}
