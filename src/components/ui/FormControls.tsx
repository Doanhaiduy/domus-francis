"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { Switch } from "@headlessui/react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  X,
  RotateCcw,
} from "lucide-react";
import { FloatingPanel } from "./FloatingPanel";

export interface SelectOption<T = string> {
  value: T;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Tên cho trình đọc màn hình khi không có nhãn hiển thị */
  "aria-label"?: string;
}

export function CustomSelect<T = string>({
  value,
  onChange,
  options,
  label,
  placeholder = "Chọn tùy chọn...",
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
}: CustomSelectProps<T>) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selectedIdx = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIdx >= 0 ? options[selectedIdx] : undefined;
  const close = useCallback(() => setOpen(false), []);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {label && <label id={labelId} className="block text-xs font-bold text-gray-700 mb-1.5">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={`relative w-full cursor-pointer rounded-xl bg-white py-2.5 pl-3.5 pr-10 text-left text-xs font-semibold text-gray-900 border shadow-2xs hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? "border-primary ring-2 ring-purple-200" : "border-gray-200"
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className={`truncate ${selectedOption ? "" : "text-gray-400 font-normal"}`}>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180 text-primary" : "text-gray-400"}`} aria-hidden="true" />
        </span>
      </button>
      <FloatingPanel open={open} onClose={close} anchorRef={btnRef} maxHeight={260} className="p-1 text-xs">
        <div role="listbox">
          {options.length === 0 && <div className="px-3 py-2 text-gray-400">Không có lựa chọn</div>}
          {options.map((option, idx) => {
            const selected = idx === selectedIdx;
            return (
              <div
                key={idx}
                role="option"
                aria-selected={selected}
                ref={(el) => {
                  if (el && idx === active) el.scrollIntoView({ block: "nearest" });
                }}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(idx)}
                className={`relative cursor-pointer select-none py-2 pl-8 pr-4 rounded-xl transition-colors ${
                  idx === active ? "bg-purple-50 text-primary font-bold" : "text-gray-800"
                } ${selected ? "font-bold text-primary bg-purple-50/60" : ""}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.icon && <span className="shrink-0">{option.icon}</span>}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.subLabel && <span className="text-[10px] text-gray-400 font-normal">{option.subLabel}</span>}
                  </div>
                </div>
                {selected && (
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-primary">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </FloatingPanel>
    </div>
  );
}

export interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Dòng gợi ý nhỏ dưới ô (ẩn khi đang có lỗi). */
  hint?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightSuffix?: string;
}

export const CustomInput: React.FC<CustomInputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightSuffix,
  className = "",
  ...props
}) => {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-2xs">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
            {leftIcon}
          </div>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-xl border border-gray-200 bg-white py-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all ${
            leftIcon ? "pl-10" : "pl-3.5"
          } ${rightSuffix ? "pr-12" : "pr-3.5"} ${
            error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""
          } ${className}`}
          {...props}
        />
        {rightSuffix && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-bold text-gray-400">
            {rightSuffix}
          </div>
        )}
      </div>
      {error ? <p className="mt-1 text-[11px] text-rose-500">{error}</p> : hint ? <div className="mt-1 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
};

export interface CustomTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** Dòng gợi ý nhỏ dưới ô (ẩn khi đang có lỗi). */
  hint?: React.ReactNode;
}

/** Có forwardRef để nơi dùng đọc/đặt vị trí con trỏ (trình soạn bài chèn định dạng vào chỗ đang chọn). */
export const CustomTextarea = React.forwardRef<HTMLTextAreaElement, CustomTextareaProps>(function CustomTextarea(
  { label, error, hint, className = "", rows = 3, ...props },
  ref
) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-2xs">
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          ref={ref}
          rows={rows}
          className={`w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all leading-relaxed ${
            error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""
          } ${className}`}
          {...props}
        />
      </div>
      {error ? <p className="mt-1 text-[11px] text-rose-500">{error}</p> : hint ? <div className="mt-1 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  );
});

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const CustomToggle: React.FC<CustomToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled,
}) => {
  return (
    <div className="flex items-center justify-between py-1">
      {(label || description) && (
        <div className="flex flex-col mr-3">
          {label && <span className="text-xs font-bold text-gray-900">{label}</span>}
          {description && <span className="text-[11px] text-gray-500">{description}</span>}
        </div>
      )}
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        className={`${
          checked ? "bg-primary" : "bg-gray-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-200`}
      >
        <span
          aria-hidden="true"
          className={`${
            checked ? "translate-x-5" : "translate-x-0"
          } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
        />
      </Switch>
    </div>
  );
};

/* ========================================================================= */
/* CUSTOM DATE PICKER (THEME-ALIGNED, ACCESSIBLE, ROBUST)                    */
/* ========================================================================= */

interface CustomDatePickerProps {
  value?: string; // either "YYYY-MM-DD" or "DD/MM/YYYY"
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  format?: "DD/MM/YYYY" | "YYYY-MM-DD";
  className?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value = "",
  onChange,
  label,
  placeholder = "Chọn ngày...",
  format = "DD/MM/YYYY",
  className = "",
  disabled = false,
  error,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const todayDate = new Date();

  // Parse initial date value
  const parseDateValue = (str: string): Date | null => {
    if (!str) return null;
    if (str.includes("-")) {
      const parts = str.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (!isNaN(d.getTime())) return d;
      }
    } else if (str.includes("/")) {
      const parts = str.split("/");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  const selectedDate = parseDateValue(value);

  // Calendar navigation state: default to selected date or current month
  const [navYear, setNavYear] = useState<number>(() => {
    return selectedDate ? selectedDate.getFullYear() : todayDate.getFullYear();
  });
  const [navMonth, setNavMonth] = useState<number>(() => {
    return selectedDate ? selectedDate.getMonth() : todayDate.getMonth();
  });

  // Sync nav month/year when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      setNavYear(selectedDate.getFullYear());
      setNavMonth(selectedDate.getMonth());
    }
  }, [value]);

  // Chọn nhanh tháng / năm: "days" (lịch ngày) → bấm tiêu đề → "months" → bấm năm → "years" (12 năm một trang)
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearPage, setYearPage] = useState(() => Math.floor((selectedDate ? selectedDate.getFullYear() : todayDate.getFullYear()) / 12) * 12);
  useEffect(() => {
    if (!isOpen) setView("days"); // mở lại luôn bắt đầu ở lịch ngày
  }, [isOpen]);

  // Format date helper
  const formatDateOutput = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return format === "YYYY-MM-DD" ? `${year}-${month}-${day}` : `${day}/${month}/${year}`;
  };

  // Display text in input
  const displayText = selectedDate
    ? `${String(selectedDate.getDate()).padStart(2, "0")}/${String(
        selectedDate.getMonth() + 1
      ).padStart(2, "0")}/${selectedDate.getFullYear()}`
    : "";

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (view === "years") return setYearPage((y) => y - 12);
    if (view === "months") return setNavYear((y) => y - 1);
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear((y) => y - 1);
    } else {
      setNavMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (view === "years") return setYearPage((y) => y + 12);
    if (view === "months") return setNavYear((y) => y + 1);
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear((y) => y + 1);
    } else {
      setNavMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const d = new Date(navYear, navMonth, day);
    onChange(formatDateOutput(d));
    setIsOpen(false);
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    setNavYear(today.getFullYear());
    setNavMonth(today.getMonth());
    onChange(formatDateOutput(today));
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  // Generate day grid
  const daysInMonth = new Date(navYear, navMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(navYear, navMonth, 1).getDay(); // 0 is Sunday
  // Convert Sunday (0) to 6, Monday (1) to 0, etc. for VN week starting Monday
  const startOffset = (firstDayOfWeek + 6) % 7;

  const monthNames = [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
    "Tháng 7",
    "Tháng 8",
    "Tháng 9",
    "Tháng 10",
    "Tháng 11",
    "Tháng 12",
  ];

  return (
    <div className={`w-full relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Input button */}
      <div
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-xs text-gray-900 cursor-pointer shadow-2xs hover:border-purple-300 focus:ring-2 focus:ring-purple-200 transition-all ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${error ? "border-rose-400" : ""}`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
          <span className={displayText ? "font-semibold text-gray-900" : "text-gray-400"}>
            {displayText || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {displayText && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              title="Xóa ngày"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? "rotate-180 text-primary" : ""
            }`}
          />
        </div>
      </div>

      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}

      {/* CALENDAR POPOVER */}
      <FloatingPanel open={isOpen} onClose={closePanel} anchorRef={triggerRef} width={288} maxHeight={420}>
        <div className="p-3.5">
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label={view === "years" ? "12 năm trước" : view === "months" ? "Năm trước" : "Tháng trước"}
              className="p-1 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (view === "days") setView("months");
                else if (view === "months") {
                  setYearPage(Math.floor(navYear / 12) * 12);
                  setView("years");
                } else setView("days");
              }}
              aria-label="Chọn nhanh tháng / năm"
              title="Bấm để chọn nhanh tháng / năm"
              className="text-xs font-bold text-gray-900 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-purple-50 transition"
            >
              {view === "days" && (
                <>
                  <span>{monthNames[navMonth]}</span>
                  <span className="text-primary font-black">{navYear}</span>
                </>
              )}
              {view === "months" && <span className="text-primary font-black">{navYear}</span>}
              {view === "years" && (
                <span className="text-primary font-black">
                  {yearPage} – {yearPage + 11}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${view !== "days" ? "rotate-180" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label={view === "years" ? "12 năm sau" : view === "months" ? "Năm sau" : "Tháng sau"}
              className="p-1 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {view === "years" && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {Array.from({ length: 12 }).map((_, i) => {
                const y = yearPage + i;
                const isSel = y === navYear;
                const isNow = y === todayDate.getFullYear();
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setNavYear(y);
                      setView("months");
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition ${
                      isSel ? "bg-primary text-white font-bold" : isNow ? "bg-purple-50 text-primary font-bold border border-purple-200" : "text-gray-700 hover:bg-purple-50 hover:text-primary"
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {view === "months" && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {monthNames.map((name, m) => {
                const isSel = selectedDate && selectedDate.getFullYear() === navYear && selectedDate.getMonth() === m;
                const isNow = todayDate.getFullYear() === navYear && todayDate.getMonth() === m;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setNavMonth(m);
                      setView("days");
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition ${
                      isSel ? "bg-primary text-white font-bold" : isNow ? "bg-purple-50 text-primary font-bold border border-purple-200" : "text-gray-700 hover:bg-purple-50 hover:text-primary"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {view === "days" && (
            <>
              {/* Day of Week Header */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1.5">
                <span>T2</span>
                <span>T3</span>
                <span>T4</span>
                <span>T5</span>
                <span>T6</span>
                <span>T7</span>
                <span className="text-rose-500">CN</span>
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-7 w-7" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isSelected =
                    selectedDate &&
                    selectedDate.getDate() === day &&
                    selectedDate.getMonth() === navMonth &&
                    selectedDate.getFullYear() === navYear;

                  const isToday =
                    navYear === todayDate.getFullYear() && navMonth === todayDate.getMonth() && day === todayDate.getDate();

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleSelectDay(day)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                        isSelected
                          ? "bg-primary text-white font-bold shadow-xs scale-105"
                          : isToday
                          ? "bg-purple-50 text-primary font-bold border border-purple-200 hover:bg-purple-100"
                          : "text-gray-700 hover:bg-purple-50 hover:text-primary"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Quick Actions Footer */}
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-primary font-bold hover:underline inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Hôm nay</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
};

/* ========================================================================= */
/* CUSTOM DATE RANGE PICKER (FOR REPORTS, EXPENSES, FILTERS)                 */
/* ========================================================================= */

interface CustomDateRangePickerProps {
  startDate: string; // "YYYY-MM-DD" or "DD/MM/YYYY"
  endDate: string;
  onChange: (start: string, end: string) => void;
  label?: string;
  className?: string;
}

export const CustomDateRangePicker: React.FC<CustomDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  label,
  className = "",
}) => {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <CustomDatePicker
          value={startDate}
          onChange={(val) => onChange(val, endDate)}
          placeholder="Từ ngày..."
          format="YYYY-MM-DD"
          className="flex-1"
        />
        <span className="text-gray-400 text-xs font-bold shrink-0">→</span>
        <CustomDatePicker
          value={endDate}
          onChange={(val) => onChange(startDate, val)}
          placeholder="Đến ngày..."
          format="YYYY-MM-DD"
          className="flex-1"
        />
      </div>
    </div>
  );
};

/* ========================================================================= */
/* CUSTOM TIME PICKER                                                        */
/* ========================================================================= */

interface CustomTimePickerProps {
  value: string; // e.g. "19:30" or "19:30 tối"
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  required?: boolean;
}

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = "Chọn giờ...",
  className = "",
  error,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const PRESET_TIMES = [
    "05:30 sáng",
    "06:00 sáng",
    "07:00 sáng",
    "11:30 trưa",
    "12:00 trưa",
    "17:30 chiều",
    "18:00 tối",
    "19:00 tối",
    "19:30 tối",
    "20:00 tối",
    "21:00 tối",
    "22:00 đêm",
  ];

  return (
    <div className={`w-full relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-xs text-gray-900 cursor-pointer shadow-2xs hover:border-purple-300 focus:ring-2 focus:ring-purple-200 transition-all ${
          error ? "border-rose-400" : ""
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <span className={value ? "font-semibold text-gray-900" : "text-gray-400"}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        />
      </div>

      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}

      <FloatingPanel open={isOpen} onClose={closePanel} anchorRef={triggerRef} minWidth={240} maxHeight={360}>
        <div className="p-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Khung giờ sinh hoạt:
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_TIMES.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => {
                  onChange(time);
                  setIsOpen(false);
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold text-left transition ${
                  value === time
                    ? "bg-primary text-white font-bold"
                    : "text-gray-700 hover:bg-purple-50 hover:text-primary"
                }`}
              >
                {time}
              </button>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
            <input
              type="text"
              placeholder="Nhập giờ khác..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 font-bold rounded-lg text-gray-700"
            >
              Xong
            </button>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
};

/* ========================================================================= */
/* CUSTOM TIME INPUT — giờ 24h "HH:MM" (thay <input type="time"> gốc)         */
/* ========================================================================= */

interface CustomTimeInputProps {
  /** "HH:MM" (24 giờ) hoặc rỗng */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Bước phút trong bảng chọn nhanh (mặc định 5); gõ tay vẫn nhập được phút bất kỳ */
  minuteStep?: number;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

export const CustomTimeInput: React.FC<CustomTimeInputProps> = ({ value, onChange, label, placeholder = "Chọn giờ...", className = "", error, required = false, disabled = false, minuteStep = 5 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const m = TIME_RE.exec(value.trim());
  const hour = m ? Number(m[1]) : null;
  const minute = m ? Number(m[2]) : null;
  const [typed, setTyped] = useState(value);
  useEffect(() => {
    if (isOpen) setTyped(value);
  }, [isOpen, value]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  const cell = (on: boolean) =>
    `py-1.5 rounded-lg text-xs font-semibold tabular-nums transition ${on ? "bg-primary text-white font-bold" : "text-gray-700 hover:bg-purple-50 hover:text-primary"}`;

  const commitTyped = () => {
    const t = TIME_RE.exec(typed.trim());
    if (t) {
      onChange(`${pad2(Number(t[1]))}:${t[2]}`);
      setIsOpen(false);
    }
  };

  return (
    <div className={`w-full relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={label ?? "Chọn giờ"}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`w-full flex items-center justify-between rounded-xl border bg-white py-2.5 px-3 text-xs text-gray-900 cursor-pointer shadow-2xs hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${error ? "border-rose-400" : isOpen ? "border-primary ring-2 ring-purple-200" : "border-gray-200"}`}
      >
        <div className="flex items-center gap-2 truncate">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <span className={`tabular-nums ${value ? "font-semibold text-gray-900" : "text-gray-400"}`}>{value || placeholder}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180 text-primary" : ""}`} />
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}

      <FloatingPanel open={isOpen} onClose={closePanel} anchorRef={triggerRef} width={288} maxHeight={420}>
        <div className="p-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-0.5">Giờ</div>
          <div className="grid grid-cols-6 gap-1">
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChange(`${pad2(h)}:${pad2(minute ?? 0)}`)}
                className={cell(h === hour)}
              >
                {pad2(h)}
              </button>
            ))}
          </div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-3 mb-1.5 px-0.5">Phút</div>
          <div className="grid grid-cols-6 gap-1">
            {minutes.map((mi) => (
              <button
                key={mi}
                type="button"
                onClick={() => {
                  onChange(`${pad2(hour ?? 7)}:${pad2(mi)}`);
                  setIsOpen(false);
                }}
                className={cell(mi === minute)}
              >
                {pad2(mi)}
              </button>
            ))}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              aria-label="Nhập giờ dạng HH:MM"
              placeholder="HH:MM"
              maxLength={5}
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^\d:]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTyped();
                }
              }}
              className={`flex-1 min-w-0 px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:border-primary tabular-nums ${typed && !TIME_RE.test(typed.trim()) ? "border-rose-300" : "border-gray-200"}`}
            />
            <button type="button" onClick={commitTyped} disabled={!TIME_RE.test(typed.trim())} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white disabled:opacity-40">
              Xong
            </button>
            {value && !required && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Xóa
              </button>
            )}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
};

export { CustomCombobox } from "./CustomCombobox";
export type { ComboOption, CustomComboboxProps } from "./CustomCombobox";
export { ImageUploadDropzone, MultiImageUploadDropzone, previewUrl, uploadFile } from "./ImageUploadDropzone";
export type { ImageUploadDropzoneProps, MultiImageUploadDropzoneProps, UploadBucket, UploadedFile } from "./ImageUploadDropzone";
