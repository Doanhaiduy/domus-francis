import { api, uuidParam } from "@/server/http";
import { adminDelete } from "@/server/modules/admin-delete";

/** Admin dọn dữ liệu rác: xóa vĩnh viễn một ý chỉ cầu nguyện (quyền data.purge). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "prayer", uuidParam(ctx, "id"))));
