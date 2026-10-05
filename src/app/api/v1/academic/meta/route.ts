import { api } from "@/server/http";
import { getMeta } from "@/server/modules/academic";

/** Danh mục cho biểu mẫu bảng điểm: học kỳ đã bắt đầu, trường, thang điểm mặc định, hồ sơ sinh viên của chính mình. */
export const GET = api({}, (ctx) => ctx.db((tx) => getMeta(tx)));
