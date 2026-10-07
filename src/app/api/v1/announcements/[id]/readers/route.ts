import { api, uuidParam } from "@/server/http";
import { listReaders } from "@/server/modules/announcements";

/** Danh sách đã đọc / chưa đọc — chỉ người đăng và người quản lý. */
export const GET = api({}, (ctx) => ctx.db((tx) => listReaders(tx, uuidParam(ctx, "id"))));
