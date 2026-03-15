import { useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import type { ParsedQuery } from "../api/client";

interface Props {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  parsed?: ParsedQuery | null;
}

export default function SearchBar({ onSearch, isLoading, disabled, parsed }: Props) {
  const [value, setValue] = useState("");
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";

  const fire = (v: string) => { if (v.trim()) onSearch(v.trim()); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") fire(value);
  };

  const locations = parsed?.locations ?? [];
  const visual = parsed?.visual ?? "";
  const dateLabel = parsed?.date_from
    ? (parsed.date_from === parsed.date_to ? parsed.date_from : `${parsed.date_from} ~ ${parsed.date_to}`)
    : null;
  const hasTags = dateLabel || locations.length > 0 || visual;

  const pillBase = "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full";
  const pillStyle = isDark
    ? "bg-neutral-700/60 text-neutral-300"
    : "bg-neutral-100 text-neutral-600";

  const showHint = value.trim() && !isLoading && !parsed;

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? t("searchWaiting") : t("searchPlaceholder")}
          className={`w-full rounded-lg px-4 py-2 pr-28 text-sm transition-colors focus:outline-none focus:border-blue-500
                     disabled:opacity-50 disabled:cursor-not-allowed border
                     ${isDark
                       ? "bg-neutral-800 border-neutral-700 placeholder:text-neutral-500"
                       : "bg-white border-neutral-300 placeholder:text-neutral-400"}`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {showHint && (
            <span className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {t("pressEnterToSearch")}
            </span>
          )}
        </div>
      </div>
      {hasTags && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {dateLabel && (
            <span className={`${pillBase} ${pillStyle}`}>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="11" rx="1.5" />
                <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
              </svg>
              {dateLabel}
            </span>
          )}
          {locations.map((loc) => (
            <span key={loc} className={`${pillBase} ${pillStyle}`}>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z" />
                <circle cx="8" cy="6" r="1.5" />
              </svg>
              {loc}
            </span>
          ))}
          {visual && (
            <span className={`${pillBase} ${pillStyle}`}>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10 10l4 4" />
              </svg>
              {visual}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
