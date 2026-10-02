"use client";

import React, { Fragment, useState, useRef, useEffect } from "react";
import { Listbox, Transition, Switch } from "@headlessui/react";
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
}

export function CustomSelect<T = string>({
  value,
  onChange,
  options,
  label,
  placeholder = "Chọn tùy chọn...",
  className = "",
  disabled = false,
}: CustomSelectProps<T>) {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-white py-2.5 pl-3.5 pr-10 text-left text-xs font-semibold text-gray-900 border border-gray-200 shadow-2xs hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="flex items-center gap-2 truncate">
              {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </span>
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Listbox.Options className="absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-2xl bg-white p-1 text-xs shadow-xl ring-1 ring-black/5 focus:outline-none border border-purple-50">
              {options.map((option, idx) => (
                <Listbox.Option
                  key={idx}
                  value={option.value}
                  className={({ active, selected }) =>
                    `relative cursor-pointer select-none py-2 pl-8 pr-4 rounded-xl transition-colors ${
                      active ? "bg-purple-50 text-primary font-bold" : "text-gray-800"
                    } ${selected ? "font-bold text-primary bg-purple-50/60" : ""}`
                  }
                >
                  {({ selected }) => (
                    <>
                      <div className="flex items-center gap-2 truncate">
                        {option.icon && <span className="shrink-0">{option.icon}</span>}
                        <div className="flex flex-col">
                          <span className="truncate">{option.label}</span>
                          {option.subLabel && (
                            <span className="text-[10px] text-gray-400 font-normal">
                              {option.subLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {selected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-primary">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

export interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSuffix?: string;
}

export const CustomInput: React.FC<CustomInputProps> = ({
  label,
  error,
  leftIcon,
  rightSuffix,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
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
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
    </div>
  );
};

export interface CustomTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const CustomTextarea: React.FC<CustomTextareaProps> = ({
  label,
  error,
  className = "",
  rows = 3,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-2xs">
        <textarea
          rows={rows}
          className={`w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all leading-relaxed ${
            error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
    </div>
  );
};

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const CustomToggle: React.FC<CustomToggleProps> = ({
  checked,
  onChange,
  label,
  description,
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
        className={`${
          checked ? "bg-primary" : "bg-gray-200"
        } relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-200`}
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Calendar navigation state: default to selected date or October 2026
  const [navYear, setNavYear] = useState<number>(() => {
    return selectedDate ? selectedDate.getFullYear() : 2026;
  });
  const [navMonth, setNavMonth] = useState<number>(() => {
    return selectedDate ? selectedDate.getMonth() : 9; // 9 = October
  });

  // Sync nav month/year when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      setNavYear(selectedDate.getFullYear());
      setNavMonth(selectedDate.getMonth());
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
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
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear((y) => y - 1);
    } else {
      setNavMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    const today = new Date(2026, 9, 2); // 02/10/2026
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
    <div className={`w-full relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Input button */}
      <div
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
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-72 rounded-2xl bg-white p-3.5 shadow-2xl border border-purple-100 animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-xs font-bold text-gray-900 flex items-center gap-1">
              <span>{monthNames[navMonth]}</span>
              <span className="text-primary font-black">{navYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

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
                navYear === 2026 && navMonth === 9 && day === 2; // Simulated today: 02/10/2026

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
      )}
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div className={`w-full relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-gray-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
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

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full rounded-2xl bg-white p-2.5 shadow-2xl border border-purple-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Khung giờ sinh hoạt:
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
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
      )}
    </div>
  );
};

export { ImageUploadDropzone, MultiImageUploadDropzone } from "./ImageUploadDropzone";
export type { ImageUploadDropzoneProps, MultiImageUploadDropzoneProps } from "./ImageUploadDropzone";
