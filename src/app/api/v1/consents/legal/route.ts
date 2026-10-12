import { api } from "@/server/http";
import { acceptLegalTerms, getLegalConsentStatus } from "@/server/modules/consents";

/** Trạng thái đồng ý Điều khoản sử dụng + Chính sách bảo mật phiên bản hiện hành (ConsentGate dùng để quyết định hiện hộp thoại bắt buộc). */
export const GET = api({}, (ctx) => ctx.db((tx) => getLegalConsentStatus(tx)));

/** "Tôi đã đọc và đồng ý": ghi 2 đồng ý (terms_of_use + privacy_notice_ack) đúng phiên bản, kèm IP + trình duyệt làm bằng chứng. */
export const POST = api({}, (ctx) =>
  ctx.db((tx) => acceptLegalTerms(tx, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent") })),
);
