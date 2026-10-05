import { api } from "@/server/http";
import { getConfig } from "@/server/modules/academic-config";

/** Danh mục học tập cho Cài đặt: trường đại học, năm học (kèm học kỳ), nhiệm kỳ + quyền của người xem; người quản lý thấy cả mục đã ẩn/xóa và mức sử dụng. */
export const GET = api({}, (ctx) => ctx.db((tx) => getConfig(tx)));
