"use client";

import React from "react";
import { CustomSelect } from "@/components/ui/FormControls";

/**
 * Chọn túi quỹ. Nhà dùng MỘT túi quỹ chung (tiền mặt + tài khoản ngân hàng gộp) ⇒ chỉ có một lựa chọn thì ẩn ô này
 * (biểu mẫu đã tự chọn túi quỹ đó); chỉ hiện khi có từ hai túi quỹ trở lên (môi trường cũ còn tách quỹ).
 */
export function FundSelect({
  label,
  value,
  onChange,
  funds,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  funds: { id: string; name: string }[];
  placeholder?: string;
}) {
  if (funds.length <= 1) return null;
  return <CustomSelect label={label} value={value} onChange={onChange} options={funds.map((f) => ({ value: f.id, label: f.name }))} placeholder={placeholder} />;
}
