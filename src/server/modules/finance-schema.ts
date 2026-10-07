import "server-only";
import { z } from "zod";
import { zDate, zText, zUuid } from "../http";

const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} tối đa ${max} ký tự.`).nullable().optional().transform((v) => (v === undefined ? undefined : v || null));
const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM.");
const zAmount = z
  .number({ error: "Số tiền phải là số." })
  .int("Số tiền phải là số nguyên (đồng).")
  .min(1, "Số tiền phải lớn hơn 0.")
  .max(1_000_000_000, "Số tiền tối đa 1.000.000.000đ.");
export const zMethod = z.enum(["cash", "bank_transfer", "e_wallet", "other"], { error: "Phương thức thanh toán không hợp lệ." });

const expenseFields = {
  title: zText(3, 200, "Tên khoản chi"),
  amountVnd: zAmount,
  categoryId: zUuid,
  expenseDate: zDate,
  fundId: zUuid,
  paidByMemberId: zUuid.nullable().optional(),
  payeeName: optText(200, "Tên người nhận tiền"),
  invoiceNo: optText(100, "Số hóa đơn"),
  note: optText(1000, "Ghi chú"),
  /** Mã tệp hóa đơn (bucket receipts); null = gỡ hóa đơn hiện có */
  receiptFileId: zUuid.nullable().optional(),
  noReceiptReason: optText(500, "Lý do không có hóa đơn"),
  /** Nộp duyệt ngay sau khi lưu */
  submit: z.boolean().optional(),
};

const noReceiptRule = (v: { noReceiptReason?: string | null }) => !v.noReceiptReason || v.noReceiptReason.length >= 5;
const noReceiptMsg = { message: "Lý do không có hóa đơn tối thiểu 5 ký tự.", path: ["noReceiptReason"] };

export const CreateExpenseSchema = z
  .object({ ...expenseFields, clientRequestId: zUuid.optional() })
  .refine(noReceiptRule, noReceiptMsg);
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export const UpdateExpenseSchema = z
  .object({
    title: expenseFields.title.optional(),
    amountVnd: zAmount.optional(),
    categoryId: zUuid.optional(),
    expenseDate: zDate.optional(),
    fundId: zUuid.optional(),
    paidByMemberId: expenseFields.paidByMemberId,
    payeeName: expenseFields.payeeName,
    invoiceNo: expenseFields.invoiceNo,
    note: expenseFields.note,
    receiptFileId: expenseFields.receiptFileId,
    noReceiptReason: expenseFields.noReceiptReason,
    submit: z.boolean().optional(),
  })
  .refine(noReceiptRule, noReceiptMsg);
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;

export const DecisionSchema = z
  .object({ decision: z.enum(["approved", "rejected"]), comment: optText(500, "Nhận xét") })
  .refine((v) => v.decision === "approved" || (v.comment?.length ?? 0) >= 5, {
    message: "Từ chối phiếu phải nêu lý do (tối thiểu 5 ký tự).",
    path: ["comment"],
  });

export const PaySchema = z
  .object({
    method: zMethod,
    paidOn: zDate,
    reference: optText(100, "Mã tham chiếu giao dịch"),
    /** Chứng từ chi (ủy nhiệm chi, biên nhận) — bucket receipts */
    proofFileId: zUuid.nullable().optional(),
  })
  .refine((v) => v.method !== "bank_transfer" || !!v.reference, {
    message: "Chi chuyển khoản phải có mã giao dịch / số ủy nhiệm chi để đối soát sao kê.",
    path: ["reference"],
  });

export const ReasonSchema = z.object({ reason: zText(5, 500, "Lý do") });

/** Lập kế hoạch thu: quỹ định kỳ (mức theo cấu hình) hoặc tiền điện nước tháng (tổng hóa đơn chia đều). */
const PlanBase = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("periodic_dues"),
      /** Tháng đầu kỳ (mặc định: kỳ hiện tại) */
      startMonth: zMonth.optional(),
      dueDate: zDate.optional(),
      fundId: zUuid.optional(),
    }),
    z.object({
      kind: z.literal("utility"),
      /** Tháng hóa đơn điện nước */
      month: zMonth,
      /** Nhập MỘT trong hai: tổng hóa đơn cả nhà HOẶC số tiền mỗi người (hệ thống tự tính tổng = mỗi người × số người) */
      billTotalVnd: zAmount.optional(),
      perPersonVnd: zAmount.max(100_000_000, "Số tiền mỗi người tối đa 100.000.000đ.").optional(),
      /** Trừ quỹ ngay: tự lập phiếu chi đã chi bằng tổng hóa đơn; anh em đóng thì cộng lại quỹ */
      autoExpense: z.boolean().optional(),
      /** Hình thức trả hóa đơn (chỉ dùng khi autoExpense) */
      payMethod: zMethod.optional(),
      dueDate: zDate.optional(),
      fundId: zUuid.optional(),
      note: optText(500, "Ghi chú"),
    }),
  ],
  { error: "Chọn loại kế hoạch: quỹ định kỳ hoặc tiền điện nước (quỹ sinh hoạt tháng không còn lập mới)." }
);
export const PlanSchema = PlanBase.superRefine((v, ctx) => {
  if (v.kind !== "utility") return;
  const hasTotal = v.billTotalVnd !== undefined;
  const hasPer = v.perPersonVnd !== undefined;
  if (hasTotal === hasPer) ctx.addIssue({ code: "custom", path: ["billTotalVnd"], message: "Nhập tổng hóa đơn HOẶC số tiền mỗi người (chỉ một trong hai)." });
});
export type PlanInput = z.infer<typeof PlanSchema>;

export const PlanPreviewQuery = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("periodic_dues"), startMonth: zMonth.optional(), dueDate: zDate.optional() }),
  z.object({
    kind: z.literal("utility"),
    month: zMonth,
    billTotalVnd: z.coerce.number({ error: "Tổng hóa đơn phải là số." }).int().min(0).max(1_000_000_000).optional(),
    perPersonVnd: z.coerce.number({ error: "Số tiền mỗi người phải là số." }).int().min(0).max(100_000_000).optional(),
    dueDate: zDate.optional(),
  }),
]);

const zBin = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().regex(/^\d{6}$/, "Mã ngân hàng (BIN) phải gồm 6 chữ số.").nullable().optional()
);
const zAccountNo = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^[0-9A-Za-z]{4,19}$/, "Số tài khoản chỉ gồm chữ số/chữ cái, từ 4 đến 19 ký tự."));

/** Tài khoản nhận tiền (của nhà hoặc của một thành viên). Có BIN ⇒ tạo được VietQR; không có BIN thì phải có ảnh QR. */
export const BankAccountSchema = z
  .object({
    bankBin: zBin,
    bankName: zText(2, 100, "Tên ngân hàng"),
    accountNo: zAccountNo,
    accountName: zText(2, 100, "Tên chủ tài khoản"),
    qrFileId: zUuid.nullable().optional(),
  })
  .refine((v) => !!v.bankBin || !!v.qrFileId, {
    message: "Chọn ngân hàng trong danh sách (để tạo mã VietQR) hoặc tải ảnh mã QR của tài khoản.",
    path: ["bankBin"],
  });

export const MemberPaymentAccountSchema = z
  .object({
    bankBin: zBin,
    bankName: zText(2, 100, "Tên ngân hàng"),
    accountNo: zAccountNo,
    accountName: zText(2, 100, "Tên chủ tài khoản"),
    qrFileId: zUuid.nullable().optional(),
    note: optText(300, "Ghi chú"),
  })
  .refine((v) => !!v.bankBin || !!v.qrFileId, {
    message: "Chọn ngân hàng trong danh sách (để tạo mã VietQR) hoặc tải ảnh mã QR của tài khoản.",
    path: ["bankBin"],
  });

export const PaymentSchema = z
  .object({
    memberId: zUuid,
    fundId: zUuid,
    method: zMethod,
    paidOn: zDate,
    referenceCode: optText(100, "Mã giao dịch"),
    note: optText(500, "Ghi chú"),
    allocations: z
      .array(z.object({ contributionId: zUuid, amountVnd: zAmount }))
      .min(1, "Chọn ít nhất một khoản để ghi thu.")
      .max(24),
    clientRequestId: zUuid.optional(),
  })
  .refine((v) => v.method !== "bank_transfer" || !!v.referenceCode, {
    message: "Chuyển khoản phải có mã giao dịch ngân hàng.",
    path: ["referenceCode"],
  });

export const WaiveSchema = z
  .object({
    discountVnd: z.number().int().min(0).max(1_000_000_000),
    reason: optText(500, "Lý do miễn/giảm"),
  })
  .refine((v) => v.discountVnd === 0 || (v.reason?.length ?? 0) >= 5, {
    message: "Miễn/giảm phải nêu lý do (tối thiểu 5 ký tự).",
    path: ["reason"],
  });

export const AdjustContributionSchema = z.object({
  amountDueVnd: z.number().int().min(0).max(50_000_000, "Mức thu tối đa 50.000.000 đ."),
  reason: zText(3, 500, "Lý do điều chỉnh"),
});

export const RangeQuery = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  all: z.enum(["0", "1"]).optional(),
});

export { zMonth };

/** Ghi thu HÀNG LOẠT (vd. anh em đã đóng quỹ trước khi dùng hệ thống): một ngày, một hình thức, nhiều người — tất cả hoặc không gì cả. */
export const BulkPaymentSchema = z
  .object({
    fundId: zUuid,
    method: zMethod,
    paidOn: zDate,
    note: optText(300, "Ghi chú"),
    items: z
      .array(
        z.object({
          memberId: zUuid,
          contributionId: zUuid,
          amountVnd: zAmount,
          /** Mã giao dịch ngân hàng (chuyển khoản) — bỏ trống thì hệ thống ghi "Đóng trước khi dùng hệ thống" */
          referenceCode: optText(100, "Mã giao dịch"),
        })
      )
      .min(1, "Chọn ít nhất một người để ghi thu.")
      .max(200, "Mỗi lần ghi thu tối đa 200 người."),
    /** Bắt buộc: gửi lại cùng mã (mất mạng, bấm lại) không ghi thu trùng */
    clientRequestId: zUuid,
  })
  .refine((v) => new Set(v.items.map((i) => i.contributionId)).size === v.items.length, {
    message: "Mỗi khoản phải thu chỉ được chọn một lần.",
    path: ["items"],
  });
export type BulkPaymentInput = z.infer<typeof BulkPaymentSchema>;
