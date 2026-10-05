import { api } from "@/server/http";
import { unreadCounts } from "@/server/modules/announcements";

/** { announcementsUnread, notificationsUnread } — dùng cho chuông Header, badge Sidebar, Tổng quan. */
export const GET = api({}, (ctx) => ctx.db((tx) => unreadCounts(tx)));
