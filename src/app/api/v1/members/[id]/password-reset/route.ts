import { api, uuidParam } from "@/server/http";
import { resetMemberPassword } from "@/server/modules/accounts";

export const POST = api({}, (ctx) => resetMemberPassword(ctx, uuidParam(ctx, "id")));
