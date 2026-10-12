import React from "react";

/**
 * Dữ liệu có cấu trúc (schema.org JSON-LD) cho công cụ tìm kiếm. Server Component.
 * Trường `undefined` bị JSON.stringify bỏ đi; "<" được thoát để nội dung (tên, câu hỏi…) không thể đóng thẻ <script>.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
