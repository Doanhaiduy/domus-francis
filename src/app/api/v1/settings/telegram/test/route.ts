import { api } from "@/server/http";
import { telegramDryRun } from "@/server/modules/settings";

/** "Gửi thử" Telegram — chế độ local: KHÔNG gọi Telegram, chỉ kiểm cấu hình đã lưu và trả bản xem trước tin nhắn. */
export const POST = api({}, (ctx) => ctx.db(telegramDryRun));
