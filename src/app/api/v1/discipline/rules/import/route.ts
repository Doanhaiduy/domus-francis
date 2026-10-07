import { api } from "@/server/http";
import { importFromHouseRules } from "@/server/modules/discipline";

/** Nhập các điều khoản của "Luật nhà" làm điều luật phạt (bỏ qua điều đã có). */
export const POST = api({}, (ctx) => ctx.db((tx) => importFromHouseRules(tx)));
