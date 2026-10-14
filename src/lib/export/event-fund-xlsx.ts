"use client";

// Xuất BIÊN BẢN QUYẾT TOÁN một quỹ riêng (chuyến đi / sự kiện) ra Excel (.xlsx), chạy hoàn toàn trong trình duyệt:
//   • "Tong ket": số liệu chính (đã thu, đã chi, bù từ quỹ nhà, hoàn lại, còn lại) + cách xử lý phần dư khi đóng quỹ.
//   • "Nguoi dong": từng người tham gia — phải đóng, đã đóng, còn thiếu; kèm các khoản đóng ngoài danh sách.
//   • "Phieu thu": từng phiếu thu (kể cả đã hủy, để đối chiếu).
//   • "Phieu chi": từng phiếu chi ĐÃ CHI; có món thì liệt kê từng món.
// SĐT người ngoài có trong tệp (chỉ người phụ trách / người quản lý mở được trang này) — tệp là tài liệu nội bộ, không đăng công khai.
import { PAYMENT_METHOD_LABEL, type ExpenseDto } from "@/lib/types/finance";
import { SETTLEMENT_MODE_LABEL, type EventFundParticipant, type EventFundReceipt, type EventFundSummary } from "@/lib/types/event-funds";

const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: "#EDE9FE", align: "center", alignVertical: "center", wrap: true, bottomBorderStyle: "thin" });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const money = (value: number, extra: Record<string, unknown> = {}): Cell => ({ value, type: Number, format: "#,##0", align: "right", ...extra });
const bold = (value: string): Cell => ({ value, type: String, fontWeight: "bold" });

export interface EventFundExport {
  summary: EventFundSummary;
  roster: EventFundParticipant[];
  receipts: EventFundReceipt[];
  expenses: ExpenseDto[];
}

/** Tiến độ đóng của từng người + các khoản đóng ngoài danh sách (gom theo tên). Tách riêng để kiểm thử/tái dùng. */
export function buildPayerRows(roster: EventFundParticipant[], receipts: EventFundReceipt[]) {
  const live = receipts.filter((r) => !r.voidedAt);
  const rows = roster
    .filter((p) => !p.removed)
    .map((p) => ({ name: p.name, kind: p.isGuest ? "Người ngoài" : "Thành viên", phone: p.phone ?? "", dueVnd: p.dueVnd, paidVnd: p.paidVnd }));
  const adHoc = new Map<string, { name: string; paidVnd: number }>();
  for (const r of live.filter((x) => !x.participantId)) {
    const k = r.payerName.trim().toLowerCase();
    const cur = adHoc.get(k) ?? { name: r.payerName.trim(), paidVnd: 0 };
    cur.paidVnd += r.amountVnd;
    adHoc.set(k, cur);
  }
  for (const a of adHoc.values()) rows.push({ name: a.name, kind: "Ngoài danh sách", phone: "", dueVnd: 0, paidVnd: a.paidVnd });
  return rows;
}

export async function downloadEventFundXlsx(x: EventFundExport) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const s = x.summary;
  const paidExpenses = x.expenses.filter((e) => e.status === "paid").sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.voucherNo.localeCompare(b.voucherNo));

  const summary: Cell[][] = [
    [{ value: `BIÊN BẢN QUYẾT TOÁN QUỸ RIÊNG — ${s.fund.name}`, fontWeight: "bold", fontSize: 13 }],
    [txt(s.fund.eventTitle ? `Sự kiện: ${s.fund.eventTitle}${s.fund.eventStartsAt ? ` (${dmy(s.fund.eventStartsAt.slice(0, 10))})` : ""}` : "")],
    [txt(`Người phụ trách: ${s.managers.map((m) => m.name).join(", ") || "—"}`)],
    [txt(`Trạng thái: ${s.fund.isActive ? "Đang mở" : "Đã đóng"}`)],
    [],
    [head("Khoản mục"), head("Số tiền (đ)")],
    [txt("Tổng đã thu (phiếu thu còn hiệu lực)"), money(s.receiptsVnd)],
    [txt("Quỹ nhà bù vào (ròng)"), money(s.subsidyVnd)],
    [txt("Tổng đã chi (phiếu chi đã chi)"), money(s.spentVnd)],
    [txt("Đã hoàn lại / chuyển về quỹ nhà khi đóng quỹ"), money(s.refundedVnd)],
    [bold("Số dư hiện tại"), money(s.balanceVnd, { fontWeight: "bold", backgroundColor: "#EDE9FE" })],
  ];
  if (s.settlement) {
    summary.push([], [bold(`Quyết toán ngày ${dmy(s.settlement.settledAt.slice(0, 10))}: ${SETTLEMENT_MODE_LABEL[s.settlement.mode]}`)]);
    if (s.settlement.note) summary.push([txt(`Ghi chú: ${s.settlement.note}`)]);
    if (s.settlement.lines.length) {
      summary.push([head("Người nhận"), head("Đã đóng (đ)"), head("Được hoàn / chuyển (đ)")]);
      for (const l of s.settlement.lines) summary.push([txt(l.name), money(l.paidVnd), money(l.amountVnd)]);
    }
  }

  const payers = buildPayerRows(x.roster, x.receipts);
  const payerSheet: Cell[][] = [
    ["Họ tên", "Loại", "Số điện thoại", "Phải đóng (đ)", "Đã đóng (đ)", "Còn thiếu (đ)"].map(head),
    ...payers.map((p): Cell[] => [txt(p.name), txt(p.kind), txt(p.phone), money(p.dueVnd), money(p.paidVnd), money(Math.max(0, p.dueVnd - p.paidVnd))]),
    [null, null, bold("TỔNG"), money(payers.reduce((a, p) => a + p.dueVnd, 0), { fontWeight: "bold" }), money(payers.reduce((a, p) => a + p.paidVnd, 0), { fontWeight: "bold" }), money(payers.reduce((a, p) => a + Math.max(0, p.dueVnd - p.paidVnd), 0), { fontWeight: "bold" })],
  ];

  const receiptSheet: Cell[][] = [
    ["Ngày thu", "Người đóng", "Số tiền (đ)", "Hình thức", "Mã giao dịch", "Ghi chú", "Người ghi", "Trạng thái"].map(head),
    ...x.receipts
      .slice()
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.localeCompare(b.createdAt))
      .map((r): Cell[] => [
        txt(dmy(r.paidOn)),
        txt(r.payerName),
        money(r.amountVnd),
        txt(PAYMENT_METHOD_LABEL[r.method]),
        txt(r.referenceCode),
        txt(r.note),
        txt(r.receivedByName),
        txt(r.voidedAt ? `Đã hủy: ${r.voidReason ?? ""}` : "Hiệu lực"),
      ]),
  ];

  const expenseRows: Cell[][] = [];
  for (const e of paidExpenses) {
    const payer = e.paidBy?.name ?? "Quỹ chi trực tiếp";
    if (!e.items.length) expenseRows.push([txt(dmy(e.expenseDate)), txt(e.voucherNo), txt(e.title), txt(e.category.name), txt(e.title), money(e.amountVnd), txt(payer)]);
    else for (const i of e.items) expenseRows.push([txt(dmy(e.expenseDate)), txt(e.voucherNo), txt(e.title), txt(e.category.name), txt(`${i.name}${i.quantity !== 1 || i.unit ? ` (${i.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}${i.unit ? ` ${i.unit}` : ""})` : ""}`), money(i.amountVnd), txt(payer)]);
  }
  const expenseSheet: Cell[][] = [
    ["Ngày chi", "Số phiếu", "Nội dung phiếu", "Phân loại", "Khoản / món", "Thành tiền (đ)", "Người ứng / chi"].map(head),
    ...expenseRows,
    [null, null, null, null, bold("TỔNG CHI"), money(paidExpenses.reduce((a, e) => a + e.amountVnd, 0), { fontWeight: "bold", backgroundColor: "#EDE9FE" }), null],
  ];

  const sheets = [
    { data: summary, sheet: "Tong ket", columns: [{ width: 46 }, { width: 18 }, { width: 24 }] },
    { data: payerSheet, sheet: "Nguoi dong", columns: [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }], stickyRowsCount: 1 },
    { data: receiptSheet, sheet: "Phieu thu", columns: [{ width: 12 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 28 }, { width: 22 }, { width: 28 }], stickyRowsCount: 1 },
    { data: expenseSheet, sheet: "Phieu chi", columns: [{ width: 12 }, { width: 18 }, { width: 32 }, { width: 20 }, { width: 34 }, { width: 16 }, { width: 22 }], stickyRowsCount: 1 },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`Quyet_toan_${slug(s.fund.name)}.xlsx`);
}
