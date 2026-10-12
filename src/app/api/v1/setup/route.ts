import { api } from "@/server/http";
import { getSetupStatus } from "@/server/modules/setup";

/** Danh sách việc "Bắt đầu thiết lập" (Admin/Trưởng nhà) kèm trạng thái xong/chưa; nhóm "Vận hành hệ thống" chỉ Admin thấy. */
export const GET = api({}, (ctx) => getSetupStatus(ctx));
