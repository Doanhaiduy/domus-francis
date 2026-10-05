// Mã VietQR (chuẩn EMVCo/NAPAS) tạo NGOÀI MẠNG ngay trên trình duyệt — không gọi dịch vụ ngoài.
// Cấu trúc (mỗi trường = ID 2 số + độ dài 2 số + giá trị):
//   00 = "01" (phiên bản) · 01 = "11" (QR tĩnh) | "12" (QR động — có số tiền)
//   38 = { 00: "A000000727" (NAPAS), 01: { 00: BIN ngân hàng 6 số, 01: số tài khoản }, 02: "QRIBFTTA" (chuyển tới tài khoản) }
//   53 = "704" (VND) · 54 = số tiền · 58 = "VN" · 62 = { 08: nội dung chuyển khoản (không dấu, ≤ 25 ký tự) }
//   63 = CRC16-CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) tính trên toàn chuỗi kể cả "6304".

/** Ngân hàng / ngân hàng số phổ biến tại Việt Nam có trong mạng NAPAS 247 (mã BIN dùng cho VietQR). */
export const VN_BANKS: { bin: string; code: string; name: string }[] = [
  { bin: "970436", code: "VCB", name: "Vietcombank" },
  { bin: "970415", code: "ICB", name: "VietinBank" },
  { bin: "970418", code: "BIDV", name: "BIDV" },
  { bin: "970405", code: "VBA", name: "Agribank" },
  { bin: "970407", code: "TCB", name: "Techcombank" },
  { bin: "970422", code: "MB", name: "MB Bank" },
  { bin: "970416", code: "ACB", name: "ACB" },
  { bin: "970432", code: "VPB", name: "VPBank" },
  { bin: "970423", code: "TPB", name: "TPBank" },
  { bin: "970403", code: "STB", name: "Sacombank" },
  { bin: "970441", code: "VIB", name: "VIB" },
  { bin: "970443", code: "SHB", name: "SHB" },
  { bin: "970437", code: "HDB", name: "HDBank" },
  { bin: "970448", code: "OCB", name: "OCB" },
  { bin: "970426", code: "MSB", name: "MSB" },
  { bin: "970440", code: "SEAB", name: "SeABank" },
  { bin: "970431", code: "EIB", name: "Eximbank" },
  { bin: "970449", code: "LPB", name: "LPBank" },
  { bin: "970428", code: "NAB", name: "Nam A Bank" },
  { bin: "970409", code: "BAB", name: "Bac A Bank" },
  { bin: "970412", code: "PVCB", name: "PVcomBank" },
  { bin: "970425", code: "ABB", name: "ABBANK" },
  { bin: "970452", code: "KLB", name: "KienlongBank" },
  { bin: "970419", code: "NCB", name: "NCB" },
  { bin: "970433", code: "VIETBANK", name: "VietBank" },
  { bin: "970438", code: "BVB", name: "BaoViet Bank" },
  { bin: "970454", code: "VCCB", name: "Viet Capital Bank (BVBank)" },
  { bin: "970429", code: "SCB", name: "SCB" },
  { bin: "970400", code: "SGICB", name: "Saigonbank" },
  { bin: "970430", code: "PGB", name: "PGBank" },
  { bin: "970427", code: "VAB", name: "VietABank" },
  { bin: "970406", code: "DOB", name: "DongA Bank" },
  { bin: "970424", code: "SHBVN", name: "Shinhan Bank" },
  { bin: "970457", code: "WVN", name: "Woori Bank" },
  { bin: "546034", code: "CAKE", name: "Cake by VPBank" },
  { bin: "546035", code: "UBANK", name: "Ubank by VPBank" },
  { bin: "963388", code: "TIMO", name: "Timo" },
];

export const bankByBin = (bin: string | null | undefined) => (bin ? VN_BANKS.find((b) => b.bin === bin) ?? null : null);

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, không đảo bit, không XOR cuối). Kiểm tra: "123456789" ⇒ 0x29B1. */
export function crc16ccitt(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Bỏ dấu tiếng Việt (kể cả Đ/đ). */
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Nội dung chuyển khoản an toàn cho mọi ngân hàng: không dấu, IN HOA, chỉ chữ/số/khoảng trắng/gạch ngang, tối đa `max` ký tự. */
export function transferContent(text: string, max = 25): string {
  return stripDiacritics(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Nội dung nộp quỹ: "<MÃ KẾ HOẠCH> <TÊN KHÔNG DẤU>" — tên đầy đủ, quá dài thì dùng tên gọi, rồi mới cắt bớt (≤ 25 ký tự). */
export function duesTransferContent(planCode: string, fullName: string, displayName?: string | null): string {
  const full = transferContent(`${planCode} ${fullName}`, 200);
  if (full.length <= 25) return full;
  if (displayName) {
    const short = transferContent(`${planCode} ${displayName}`, 200);
    if (short.length <= 25) return short;
  }
  return transferContent(full, 25);
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

export interface VietQrInput {
  /** BIN ngân hàng 6 số */
  bankBin: string;
  accountNo: string;
  /** Số tiền VND (nguyên dương) — có ⇒ QR động */
  amountVnd?: number | null;
  /** Nội dung chuyển khoản (sẽ được chuẩn hóa không dấu, ≤ 25 ký tự) */
  content?: string | null;
}

/** true nếu đủ thông tin tạo VietQR (BIN 6 số + số tài khoản hợp lệ). */
export const canBuildVietQr = (bankBin: string | null | undefined, accountNo: string | null | undefined) =>
  !!bankBin && /^\d{6}$/.test(bankBin) && !!accountNo && /^[0-9A-Za-z]{4,19}$/.test(accountNo.replace(/\s/g, ""));

/** Chuỗi dữ liệu VietQR (đưa vào thư viện vẽ QR). Ném lỗi nếu thiếu BIN / số tài khoản. */
export function buildVietQrPayload(input: VietQrInput): string {
  const accountNo = input.accountNo.replace(/\s/g, "");
  if (!canBuildVietQr(input.bankBin, accountNo)) throw new Error("Thiếu mã ngân hàng hoặc số tài khoản để tạo mã VietQR.");
  const amount = input.amountVnd && input.amountVnd > 0 ? String(Math.round(input.amountVnd)) : null;
  const content = input.content ? transferContent(input.content) : "";
  const beneficiary = tlv("00", input.bankBin) + tlv("01", accountNo);
  const merchant = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  let payload =
    tlv("00", "01") +
    tlv("01", amount ? "12" : "11") +
    tlv("38", merchant) +
    tlv("53", "704") +
    (amount ? tlv("54", amount) : "") +
    tlv("58", "VN") +
    (content ? tlv("62", tlv("08", content)) : "");
  payload += "6304";
  return payload + crc16ccitt(payload).toString(16).toUpperCase().padStart(4, "0");
}

/** Vẽ một chuỗi thành ảnh QR (data URL PNG) — thư viện `qrcode` chạy hoàn toàn trên trình duyệt. */
export async function qrDataUrl(text: string, size = 320): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#111827", light: "#ffffff" } });
}
