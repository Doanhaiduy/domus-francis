import { api } from "@/server/http";
import { countNewInquiries, listInquiries } from "@/server/modules/public-site";

/** Danh sách đăng ký tìm hiểu từ trang công khai (application.review). */
export const GET = api({}, (ctx) => ctx.db(async (tx) => ({ inquiries: await listInquiries(tx), newCount: await countNewInquiries(tx) })));
