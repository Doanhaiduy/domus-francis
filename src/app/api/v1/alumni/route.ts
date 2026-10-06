import { api } from "@/server/http";
import { listAlumni } from "@/server/modules/alumni";

/** Danh sách cựu thành viên (đã ra trường / đã rời) + hồ sơ nghề nghiệp mà người xem được thấy (RLS). */
export const GET = api({}, (ctx) => ctx.db((tx) => listAlumni(tx)));
