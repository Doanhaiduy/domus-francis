import { api, uuidParam } from "@/server/http";
import { listReaders } from "@/server/modules/announcements";

/** Danh sách đã đọc / chưa đọc — chỉ người đăng và Ban điều hành. */
export const GET = api({}, (ctx) => ctx.db((tx) => listReaders(tx, uuidParam(ctx, "id"))));
