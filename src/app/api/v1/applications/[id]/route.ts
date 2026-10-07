import { api, uuidParam } from "@/server/http";
import { adminDelete } from "@/server/modules/admin-delete";

/** Admin dọn dữ liệu rác: xóa vĩnh viễn đơn xin vào nhà ĐÃ XỬ LÝ (quyền data.purge; đơn đang chờ phải duyệt/từ chối trước). */
export const DELETE = api({}, async (ctx) => ctx.db((tx) => adminDelete(tx, "application", uuidParam(ctx, "id"))));
