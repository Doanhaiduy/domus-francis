import { api } from "@/server/http";
import { getSetupStatus } from "@/server/modules/setup";

/** Danh sách việc "Bắt đầu thiết lập" (Admin/Trưởng nhà) kèm trạng thái xong/chưa. */
export const GET = api({}, (ctx) => ctx.db((tx) => getSetupStatus(tx)));
