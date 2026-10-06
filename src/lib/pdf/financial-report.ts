"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import type { buildFinanceReport } from "@/components/FinancialReportModal";
import { dmy, vnToday } from "@/lib/finance-format";
import { CONTRIBUTION_STATUS_LABEL, EXPENSE_STATUS_LABEL, type ContributionPlanDto, type FinanceOverviewDto } from "@/lib/types/finance";
import { C, FONT, baseDoc, docTitle, doubleRule, downloadPdf, fileSlug, kpiRow, letterhead, money, nowText, num, plain, sectionBar, signatures, tableLayout, th } from "./core";

export interface FinancialReportPdfInput {
  periodLabel: string;
  report: ReturnType<typeof buildFinanceReport>;
  overview: FinanceOverviewDto | undefined;
  plan: ContributionPlanDto | null;
  canSeeAllExpenses: boolean;
}

/** PDF "Bảng đối soát thu – chi quỹ sinh hoạt chung" (A4 dọc): chỉ số, bảng kê chi, tình hình các khoản thu, chữ ký. */
export async function downloadFinancialReportPdf(p: FinancialReportPdfInput) {
  const { report, overview: o, plan } = p;
  const W = 595 - 84;
  const today = vnToday();
  const house = o?.org.houseName ?? "Lưu Xá Sinh Viên Phanxicô Assisi";
  const order = o?.org.orderName ?? "Dòng Anh Em Hèn Mọn Việt Nam (OFM)";
  const totalPaid = report.paid.filter((e) => e.status === "paid").reduce((s, e) => s + e.amountVnd, 0);
  const outstanding = Math.max(0, report.duesExpectedVnd - report.duesCollectedVnd);
  const paidCount = plan?.stats.paidCount;
  const totalCount = plan?.stats.totalCount;

  const content: Content[] = [
    letterhead({ orderName: order, houseName: house, subtitle: "Ban Quản Trị Tài Chính & Đời Sống Huynh Đệ", rightTop: `MẪU SỐ: LX-TC/${today.slice(0, 4)}`, rightBottom: `Lập ngày ${dmy(today)}` }),
    doubleRule(W),
    docTitle("Bảng đối soát thu – chi quỹ sinh hoạt chung", `Kỳ đối soát: ${p.periodLabel} · Đơn vị tiền tệ: Việt Nam Đồng (VND)`),
    {
      alignment: "center",
      fontSize: 8.5,
      color: C.muted,
      margin: [0, 0, 0, 6],
      text: [
        `Số dư đầu kỳ ${money(report.openingVnd)} + Thu ${money(report.incomeVnd)} − Chi ${money(report.expenseVnd)} = Tồn cuối kỳ `,
        { text: money(report.closingVnd), bold: true, color: C.ink },
      ],
    },
    kpiRow([
      { label: "TỒN QUỸ CUỐI KỲ", value: money(report.closingVnd), color: C.primaryDark, bg: C.tint },
      {
        label: "ĐÃ THU TRONG KỲ",
        value: money(report.incomeVnd),
        color: C.green,
        bg: C.greenBg,
        note: paidCount !== null && paidCount !== undefined && totalCount ? `${paidCount}/${totalCount} thành viên` : undefined,
      },
      { label: "ĐÃ CHI TRONG KỲ", value: money(report.expenseVnd), color: C.red, bg: C.redBg, note: p.canSeeAllExpenses ? `${report.expenses.length} phiếu chi` : undefined },
      {
        label: "CHƯA THU / TỒN NỢ",
        value: money(outstanding),
        color: C.amber,
        bg: C.amberBg,
        note: report.unpaidCount !== null ? `${report.unpaidCount} thành viên` : undefined,
      },
    ]),
  ];

  // ---- I. Chi
  if (p.canSeeAllExpenses) {
    content.push(sectionBar(`I. Bảng kê chi tiết các khoản đã chi trong kỳ (${report.paid.length} khoản)`));
    const rows: TableCell[][] = [
      [th("STT", "center"), th("Số phiếu / Ngày"), th("Nội dung chi tiêu"), th("Phân loại"), th("Số tiền (đ)", "right"), th("Người ứng/chi"), th("Trạng thái")],
      ...report.paid.map((e, i): TableCell[] => [
        { text: String(i + 1), alignment: "center", color: C.muted },
        { stack: [{ text: e.voucherNo, fontSize: 8, bold: true }, { text: dmy(e.expenseDate), fontSize: 7.5, color: C.faint }] },
        { stack: [{ text: plain(e.title), bold: true }, ...(e.note ? [{ text: `Ghi chú: ${plain(e.note)}`, fontSize: 7.5, color: C.faint }] : [])] },
        { text: plain(e.category.name), fontSize: 8, color: C.muted },
        { text: num(e.amountVnd), alignment: "right", bold: true, color: e.status === "reversed" ? C.faint : C.ink, decoration: e.status === "reversed" ? "lineThrough" : undefined },
        { text: e.paidBy?.name ?? "Quỹ chi trực tiếp", fontSize: 8.5 },
        { text: EXPENSE_STATUS_LABEL[e.status], fontSize: 8, bold: true, color: e.status === "paid" ? C.green : C.primaryDark },
      ]),
      ...(report.paid.length === 0 ? [[{ text: "Không có khoản chi nào trong kỳ.", colSpan: 7, alignment: "center", color: C.faint }, {}, {}, {}, {}, {}, {}] as TableCell[]] : []),
      [
        { text: "TỔNG CỘNG CÁC PHIẾU ĐÃ CHI (theo ngày chi)", colSpan: 4, alignment: "right", font: FONT.semi },
        {},
        {},
        {},
        { text: num(totalPaid), alignment: "right", font: FONT.heavy, color: C.primaryDark },
        { text: "", colSpan: 2 },
        {},
      ],
    ];
    content.push({ table: { headerRows: 1, dontBreakRows: true, widths: [22, 80, "*", 58, 52, 56, 46], body: rows }, layout: tableLayout });
  } else {
    content.push(sectionBar("I. Cơ cấu chi tiêu trong kỳ theo danh mục"));
    const cats = o?.expenseByCategory ?? [];
    content.push(
      cats.length
        ? {
            table: {
              widths: ["*", 70, 90],
              body: cats.map((c): TableCell[] => [{ text: plain(c.name), bold: true }, { text: `${c.count} phiếu`, color: C.muted }, { text: money(c.amountVnd), alignment: "right", bold: true }]),
            },
            layout: tableLayout,
          }
        : { text: "Không có khoản chi nào trong kỳ.", color: C.faint, margin: [0, 2, 0, 0] },
    );
    content.push({ text: "Bảng kê chi tiết từng phiếu chi do Thủ quỹ/Ban điều hành lập và lưu trữ.", italics: true, fontSize: 7.5, color: C.muted, margin: [0, 4, 0, 0] });
  }

  // ---- II. Thu
  content.push(
    sectionBar(
      `II. Tình hình các khoản thu${plan ? ` – ${plan.name}` : ""}${o?.access.contributionsAll && report.contributionRows.length ? ` (${report.contributionRows.length} thành viên)` : ""}`,
    ),
  );
  if (!plan) {
    content.push({ text: "Chưa có kế hoạch thu nào (quỹ định kỳ / tiền điện nước).", color: C.muted });
  } else {
    const rule =
      plan.feeType === "utility" && plan.billTotalVnd !== null && plan.splitCount
        ? `Tổng hóa đơn ${money(plan.billTotalVnd)} ÷ ${plan.splitCount} người = ${money(plan.amountVnd)} / người`
        : `Mức đóng ${money(plan.amountVnd)} / thành viên${plan.feeType === "periodic_dues" ? " / kỳ" : ""}`;
    const pct = report.duesExpectedVnd > 0 ? ` (${Math.round((report.duesCollectedVnd / report.duesExpectedVnd) * 100)}%)` : "";
    content.push({ text: `${rule} · Hạn nộp ${dmy(plan.dueDate)} · Đã thu ${money(report.duesCollectedVnd)} / ${money(report.duesExpectedVnd)}${pct}`, fontSize: 8.5, color: C.muted, margin: [0, 0, 0, 5] });
    if (o?.access.contributionsAll) {
      const rows: TableCell[][] = [
        [th("STT", "center"), th("Thành viên"), th("Phòng"), th("Số tiền (đ)", "right"), th("Tình trạng")],
        ...report.contributionRows.map(({ row, cell }, i): TableCell[] => {
          const done = cell.status === "paid" || cell.status === "waived";
          const last = cell.payments[cell.payments.length - 1];
          const status =
            cell.status === "paid" ? `Đã nộp${last ? ` ${dmy(last.paidOn)}` : ""}` : cell.status === "waived" ? "Được miễn" : cell.status === "partial" ? `Còn thiếu ${money(cell.remainingVnd)}` : CONTRIBUTION_STATUS_LABEL[cell.status];
          return [
            { text: String(i + 1), alignment: "center", color: C.muted },
            { text: row.fullName, bold: true },
            { text: row.room ?? "", color: C.muted },
            { text: num(cell.status === "waived" ? cell.amountDueVnd : cell.netDueVnd), alignment: "right" },
            { text: status, bold: true, fontSize: 8.5, color: done ? C.green : C.red },
          ];
        }),
      ];
      content.push({ table: { headerRows: 1, dontBreakRows: true, widths: [26, "*", 50, 80, 120], body: rows }, layout: tableLayout });
    } else {
      content.push({ text: "Danh sách từng thành viên chỉ hiển thị với Thủ quỹ/Ban điều hành.", italics: true, fontSize: 8, color: C.muted });
    }
  }

  content.push(
    signatures([
      { title: "Người lập biểu (Thủ quỹ)", hint: "(Ký và ghi rõ họ tên)", name: o?.signatories.treasurer?.name ?? "………………………" },
      { title: "Duyệt chi (Trưởng lưu xá)", hint: "(Ký và xác nhận đối soát)", name: o?.signatories.houseHead?.name ?? "………………………" },
    ]),
    { text: `Biên bản được tự động kết xuất từ sổ quỹ hệ thống quản lý tài chính Lưu Xá Phanxicô lúc ${nowText()}.`, alignment: "right", fontSize: 7.5, color: C.faint, margin: [0, 10, 0, 0] },
  );

  await downloadPdf(baseDoc({ runningTitle: `Đối soát thu – chi · ${p.periodLabel}`, orgName: house }, content), `Bao_Cao_Thu_Chi_${fileSlug(p.periodLabel)}`);
}
