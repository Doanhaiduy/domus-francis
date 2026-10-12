"use client";

// Xuất SỔ QUỸ CÓ SỐ DƯ ra Excel (.xlsx) — từ GET /api/v1/finance/ledger (sổ cái bất biến, cần quyền xem sổ quỹ):
//   • mỗi túi quỹ một trang: số dư đầu kỳ → từng bút toán (ngày, số thứ tự, diễn giải, loại, chứng từ, người đối ứng, thu, chi, TỒN sau bút toán,
//     người ghi) → cộng phát sinh + số dư cuối kỳ;
//   • nhiều túi quỹ ⇒ thêm trang "Tong hop" (đầu kỳ / thu / chi / cuối kỳ từng túi + cộng).
import { LEDGER_SOURCE_LABEL, type LedgerBookDto, type LedgerBookFundDto } from "@/lib/types/finance";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

type Cell = { value: string | number | null; [k: string]: unknown } | null;
const head = (value: string, color = "#EDE9FE"): Cell => ({ value, fontWeight: "bold", backgroundColor: color, align: "center", alignVertical: "center", wrap: true, bottomBorderStyle: "thin" });
const txt = (value: string | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", type: String, ...extra });
const money = (value: number | null, extra: Record<string, unknown> = {}): Cell =>
  value === null ? txt("") : { value, type: Number, format: "#,##0", align: "right", ...extra };

function fundSheet(f: LedgerBookFundDto, book: LedgerBookDto): Cell[][] {
  const rows: Cell[][] = [
    [{ value: `SỔ QUỸ — ${f.name}`, fontWeight: "bold", fontSize: 13 }],
    [{ value: `${book.houseName ? `${book.houseName} · ` : ""}Từ ${dmy(book.from)} đến ${dmy(book.to)} · Mã túi quỹ ${f.code}`, fontSize: 10 }],
    [{ value: `Xuất lúc ${new Date(book.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Số liệu đọc thẳng từ sổ cái (bút toán bất biến; sai sót được sửa bằng bút toán đảo/điều chỉnh).`, fontSize: 9, textColor: "#6B7280" }],
    [],
    ["Ngày", "Số TT", "Diễn giải", "Loại", "Chứng từ", "Người đối ứng", "Thu (đ)", "Chi (đ)", "Tồn quỹ (đ)", "Người ghi"].map((h) => head(h)),
    [txt(dmy(book.from)), null, txt("Số dư đầu kỳ", { fontWeight: "bold" }), null, null, null, null, null, money(f.openingVnd, { fontWeight: "bold" }), null],
  ];
  for (const e of f.entries) {
    rows.push([
      txt(dmy(e.date)),
      { value: e.seq, type: Number, align: "center" },
      txt(e.description, { wrap: true }),
      txt(LEDGER_SOURCE_LABEL[e.sourceType] ?? e.sourceType),
      txt(e.document),
      txt(e.counterparty),
      money(e.direction === "in" ? e.amountVnd : null, { textColor: "#047857" }),
      money(e.direction === "out" ? e.amountVnd : null, { textColor: "#BE123C" }),
      money(e.balanceAfterVnd),
      txt(e.recordedBy),
    ]);
  }
  rows.push([
    null,
    null,
    txt("Cộng phát sinh trong kỳ", { fontWeight: "bold" }),
    null,
    null,
    null,
    money(f.inVnd, { fontWeight: "bold", backgroundColor: "#ECFDF5" }),
    money(f.outVnd, { fontWeight: "bold", backgroundColor: "#FFF1F2" }),
    null,
    null,
  ]);
  rows.push([txt(dmy(book.to)), null, txt("Số dư cuối kỳ", { fontWeight: "bold" }), null, null, null, null, null, money(f.closingVnd, { fontWeight: "bold", backgroundColor: "#EDE9FE" }), null]);
  if (book.truncated) rows.push([], [{ value: "⚠ Quá nhiều bút toán — danh sách đã bị cắt bớt; hãy xuất theo khoảng ngày ngắn hơn. Tổng và số dư cuối kỳ vẫn đúng.", textColor: "#B45309" }]);
  return rows;
}

export async function downloadLedgerXlsx(book: LedgerBookDto) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const columns = [{ width: 12 }, { width: 8 }, { width: 48 }, { width: 14 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 15 }, { width: 18 }];
  const used = new Set<string>();
  const sheets: { data: Cell[][]; sheet: string; columns: { width: number }[]; stickyRowsCount?: number }[] = book.funds.map((f) => {
    let name = `So quy ${slug(f.code)}`.slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    return { data: fundSheet(f, book), sheet: name, columns, stickyRowsCount: 5 };
  });
  if (book.funds.length > 1) {
    const sum = (k: "openingVnd" | "inVnd" | "outVnd" | "closingVnd") => book.funds.reduce((s, f) => s + f[k], 0);
    sheets.unshift({
      sheet: "Tong hop",
      columns: [{ width: 30 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }],
      data: [
        [{ value: `TỔNG HỢP SỔ QUỸ — ${dmy(book.from)} đến ${dmy(book.to)}`, fontWeight: "bold", fontSize: 13 }],
        [],
        ["Túi quỹ", "Mã", "Đầu kỳ (đ)", "Thu (đ)", "Chi (đ)", "Cuối kỳ (đ)"].map((h) => head(h)),
        ...book.funds.map((f): Cell[] => [txt(f.name), txt(f.code), money(f.openingVnd), money(f.inVnd), money(f.outVnd), money(f.closingVnd)]),
        [
          txt("CỘNG", { fontWeight: "bold" }),
          null,
          money(sum("openingVnd"), { fontWeight: "bold" }),
          money(sum("inVnd"), { fontWeight: "bold" }),
          money(sum("outVnd"), { fontWeight: "bold" }),
          money(sum("closingVnd"), { fontWeight: "bold", backgroundColor: "#EDE9FE" }),
        ],
      ],
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(`So_quy_${book.from}_den_${book.to}.xlsx`);
}
