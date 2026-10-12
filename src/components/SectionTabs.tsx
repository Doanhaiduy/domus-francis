"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { useInbox } from "@/lib/data/inbox";
import { groupOfPath, inboxKindsFor, isInPath } from "@/lib/nav-groups";
import { cn } from "@/lib/utils";
import { InboxBadge } from "./InboxBadge";

/**
 * Thanh tab chuyển giữa các trang con của một mục gộp ở thanh bên (vd. Thông báo ⇄ Diễn đàn). Không hiện nếu trang không thuộc nhóm nào.
 * Mỗi tab kèm số việc chờ xử lý của trang đó (hộp "Việc cần xử lý" — chỉ người quản lý có; đỏ = có việc quá hạn).
 */
export function SectionTabs() {
  const pathname = usePathname();
  const { can, session } = useSession();
  const group = groupOfPath(pathname);
  const inbox = useInbox(!!session?.member);
  if (!group) return null;
  const tabs = group.tabs.filter((t) => !t.requires || [t.requires].flat().some((p) => can(p)));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Các mục liên quan" className="mb-5 max-w-full overflow-x-auto">
      <div className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
        {tabs.map((t) => {
          const active = isInPath(pathname, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap", active ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900")}
            >
              {t.label}
              <InboxBadge size="sm" items={inbox.itemsOf(inboxKindsFor([t.href]))} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
