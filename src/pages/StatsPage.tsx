import { useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { useBackend } from "../hooks/useBackend";
import { api } from "../api/client";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface Tooltip { x: number; y: number; text: string }

function Bar({ value, max, maxH, color, label, onClick, onHover, onLeave }: {
  value: number; max: number; maxH: number; color: string; label?: string;
  onClick?: () => void; onHover?: (e: React.MouseEvent) => void; onLeave?: () => void;
}) {
  const pct = max > 0 ? value / max : 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-end h-full min-w-[10px]"
      onMouseMove={onHover} onMouseLeave={onLeave} onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      <div className={`w-full ${color} rounded-t transition-all hover:opacity-100 opacity-80`}
        style={{ height: Math.max(pct * maxH, value > 0 ? 2 : 0) }}
      />
      {label && <span className="text-[9px] mt-1 whitespace-nowrap text-neutral-500">{label}</span>}
    </div>
  );
}

export default function StatsPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isDark = resolved === "dark";
  const [tip, setTip] = useState<Tooltip | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const prevStats = useRef<typeof stats>(null);

  const { data: stats, isFetching } = useQuery({
    queryKey: ["stats", dateFrom, dateTo],
    queryFn: () => api.getStats(dateFrom || undefined, dateTo || undefined),
    enabled: status === "ready",
    placeholderData: keepPreviousData,
  });

  // Unfiltered — only for month options in selectors
  const { data: allData } = useQuery({
    queryKey: ["stats-all"],
    queryFn: () => api.getStats(),
    enabled: status === "ready",
  });

  const display = stats ?? prevStats.current;
  if (stats) prevStats.current = stats;
  if (!display) return null;

  const monthOptions = allData?.monthly.map((m) => m.month) ?? [];

  const selectClass = `text-xs px-2 py-1 rounded-md border appearance-none cursor-pointer ${isDark ? "bg-neutral-800 border-neutral-700 text-neutral-300" : "bg-white border-neutral-300 text-neutral-700"}`;
  const cardClass = `rounded-xl p-4 ${isDark ? "bg-neutral-800/60" : "bg-white border border-neutral-200"}`;
  const labelClass = `text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
  const valueClass = "text-2xl font-bold";
  const maxMonthly = Math.max(...display.monthly.map((m) => m.count), 1);
  const maxHour = Math.max(...display.hours.map((h) => h.count), 1);
  const maxFl = display.focal_lengths.length > 0 ? Math.max(...display.focal_lengths.map((x) => x.count)) : 1;

  const showTip = (e: React.MouseEvent, text: string) => {
    setTip({ x: e.clientX, y: e.clientY - 12, text });
  };

  return (
    <div className="flex flex-col h-full relative">
      {tip && (
        <div className="fixed z-50 pointer-events-none px-2 py-1 rounded text-xs font-medium bg-neutral-900 text-white shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
      )}

      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("stats")}</h2>
          <div className="flex items-center gap-2">
            <select value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass}>
              <option value="">{t("statsFrom")}</option>
              {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>–</span>
            <select value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass}>
              <option value="">{t("statsTo")}</option>
              {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </header>
      <div className={`flex-1 overflow-y-auto px-6 py-4 space-y-6 transition-opacity duration-200 ${isFetching ? "opacity-60" : ""}`}>
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={cardClass}><p className={labelClass}>{t("statsTotal")}</p><p className={valueClass}>{display.total}</p></div>
          <div className={cardClass}><p className={labelClass}>{t("statsFavorites")}</p><p className={valueClass}>{display.favorites}</p></div>
          <div className={cardClass}><p className={labelClass}>{t("statsCities")}</p><p className={valueClass}>{display.cities}</p></div>
          <div className={cardClass}><p className={labelClass}>{t("statsSize")}</p><p className={valueClass}>{formatSize(display.total_size)}</p></div>
        </div>

        {/* Monthly chart */}
        {display.monthly.length > 0 && (
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>{t("statsMonthly")}</p>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[2px] h-40" style={{ minWidth: Math.max(display.monthly.length * 18, 200) }}>
                {display.monthly.map((m) => (
                  <Bar key={m.month} value={m.count} max={maxMonthly} maxH={130} color="bg-blue-500"
                    label={m.month.slice(2)} onClick={() => navigate(`/timeline?y=${m.month.slice(0, 4)}`)}
                    onHover={(e) => showTip(e, `${m.month}  ${m.count} ${t("statsPhotos")}`)}
                    onLeave={() => setTip(null)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top locations & Hour distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {display.top_locations.length > 0 && (
            <div className={cardClass}>
              <p className={`${labelClass} mb-3`}>{t("statsTopLocations")}</p>
              <div className="space-y-1.5">
                {display.top_locations.map((l) => {
                  const pct = display.total > 0 ? (l.count / display.total) * 100 : 0;
                  return (
                    <div key={l.name} className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => navigate(`/?location=${encodeURIComponent(l.name)}`)}>
                      <span className="text-sm flex-1 truncate">{l.name}</span>
                      <div className={`h-1.5 rounded-full ${isDark ? "bg-neutral-700" : "bg-neutral-200"}`} style={{ width: 60 }}>
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs w-8 text-right ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>{l.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {display.hours.length > 0 && (
            <div className={cardClass}>
              <p className={`${labelClass} mb-3`}>{t("statsHours")}</p>
              <div className="flex items-end gap-[2px] h-28">
                {Array.from({ length: 24 }, (_, h) => {
                  const count = display.hours.find((x) => x.hour === h)?.count ?? 0;
                  return (
                    <Bar key={h} value={count} max={maxHour} maxH={80} color="bg-amber-500"
                      label={h % 6 === 0 ? String(h) : undefined}
                      onHover={(e) => showTip(e, `${h}:00  ${count} ${t("statsPhotos")}`)}
                      onLeave={() => setTip(null)} />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Camera & Lens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {display.top_cameras.length > 0 && (
            <div className={cardClass}>
              <p className={`${labelClass} mb-3`}>{t("statsCameras")}</p>
              <div className="space-y-1.5">
                {display.top_cameras.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => navigate(`/?camera=${encodeURIComponent(c.name)}`)}>
                    <span className={`text-xs w-4 ${isDark ? "text-neutral-600" : "text-neutral-300"}`}>{i + 1}</span>
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    <span className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {display.top_lenses.length > 0 && (
            <div className={cardClass}>
              <p className={`${labelClass} mb-3`}>{t("statsLenses")}</p>
              <div className="space-y-1.5">
                {display.top_lenses.map((l, i) => (
                  <div key={l.name} className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => navigate(`/?lens=${encodeURIComponent(l.name)}`)}>
                    <span className={`text-xs w-4 ${isDark ? "text-neutral-600" : "text-neutral-300"}`}>{i + 1}</span>
                    <span className="text-sm flex-1 truncate">{l.name}</span>
                    <span className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>{l.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Focal length distribution */}
        {display.focal_lengths.length > 0 && (
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>{t("statsFocal")}</p>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[2px] h-32" style={{ minWidth: Math.max(display.focal_lengths.length * 20, 100) }}>
                {display.focal_lengths.map((f) => (
                  <Bar key={f.fl} value={f.count} max={maxFl} maxH={100} color="bg-emerald-500"
                    label={`${f.fl}`}
                    onClick={() => navigate(`/?focal_length=${f.fl}`)}
                    onHover={(e) => showTip(e, `${f.fl}mm  ${f.count} ${t("statsPhotos")}`)}
                    onLeave={() => setTip(null)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
