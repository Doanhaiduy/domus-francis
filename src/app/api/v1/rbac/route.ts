import { api } from "@/server/http";
import { getRbacMatrix } from "@/server/modules/rbac";

/** Ma trận vai trò × quyền (từ role_permissions) và người đang giữ từng vai trò (theo RLS user_roles). */
export const GET = api({}, (ctx) => ctx.db(getRbacMatrix));
