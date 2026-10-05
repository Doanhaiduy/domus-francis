import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/** Skeleton cho từng tab của trang Cài đặt — hình dạng gần giống nội dung thật để tránh nhảy bố cục khi tải xong. */

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4 ${className}`}>{children}</div>
);

const CardHeader: React.FC = () => (
  <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
    <Skeleton className="w-8 h-8 rounded-xl" />
    <div className="space-y-1.5">
      <Skeleton className="w-40 h-4" />
      <Skeleton className="w-56 max-w-full h-3" />
    </div>
  </div>
);

const Field: React.FC = () => (
  <div className="space-y-1.5">
    <Skeleton className="w-24 h-3" />
    <Skeleton className="w-full h-10 rounded-xl" />
  </div>
);

/** Các thẻ biểu mẫu (Cấu hình chung, Telegram/Zalo, …). */
export function FormCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardHeader />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field />
            <Field />
            <Field />
            <Field />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Tab Hồ sơ cá nhân: ảnh + 4 thẻ thông tin. */
export function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải hồ sơ">
      <div className="p-5 sm:p-6 rounded-3xl border border-purple-100/80 bg-purple-50/40 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <Skeleton className="w-20 h-20 rounded-full shrink-0" />
        <div className="flex-1 w-full space-y-2.5">
          <Skeleton className="w-56 max-w-full h-6" />
          <Skeleton className="w-72 max-w-full h-3.5" />
          <Skeleton className="w-full max-w-md h-3" />
        </div>
        <div className="flex gap-2 shrink-0">
          <Skeleton className="w-24 h-9 rounded-xl" />
          <Skeleton className="w-32 h-9 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field />
              <Field />
              <Field />
              <Field />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Danh sách có thanh công cụ (Tài khoản, …). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải danh sách">
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-full sm:w-44 rounded-xl" />
      </div>
      <div className="bg-white rounded-3xl border border-purple-50 shadow-xs divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-40 max-w-full h-4" />
              <Skeleton className="w-56 max-w-full h-3" />
            </div>
            <Skeleton className="w-16 h-6 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lưới thẻ (Danh mục, Phân hệ…). */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải">
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-purple-50 shadow-xs space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="w-3/4 h-4" />
                <Skeleton className="w-1/2 h-3" />
              </div>
            </div>
            <Skeleton className="w-full h-3" />
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <Skeleton className="w-16 h-5 rounded-md" />
              <Skeleton className="w-9 h-5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phân quyền: cột vai trò + lưới quyền. */
export function RolesSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" aria-busy="true" aria-label="Đang tải phân quyền">
      <div className="lg:col-span-4 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-3.5 border border-purple-50 flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-3/4 h-4" />
              <Skeleton className="w-1/2 h-3" />
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-8 bg-white rounded-3xl p-5 border border-purple-50 shadow-xs space-y-3">
        <Skeleton className="w-48 h-5" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-1.5">
            <Skeleton className="w-2/3 h-4" />
            <Skeleton className="w-9 h-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hàng công tắc (Trợ lý AI, Phân hệ). */
export function ToggleListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải">
      <Card>
        <CardHeader />
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-1">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="w-48 max-w-full h-4" />
                <Skeleton className="w-full max-w-md h-3" />
              </div>
              <Skeleton className="w-11 h-6 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
