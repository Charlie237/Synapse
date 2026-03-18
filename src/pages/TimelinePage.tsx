import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { useBackend } from "../hooks/useBackend";
import { api, ImageInfo } from "../api/client";
import ImageViewer from "../components/ImageViewer";

function MonthRow({ month, count, locations, maxCount, isDark }: {
  month: string; count: number; locations: string; maxCount: number; isDark: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["timeline", month],
    queryFn: () => api.getTimelineMonth(month),
    enabled: expanded,
  });

  const images: ImageInfo[] = data?.images ?? [];
  const monthNum = parseInt(month.slice(5));
  const locs = locations.split("|").filter(Boolean);
  const barW = Math.max((count / maxCount) * 100, 4);

  // Group images by date
  const dayGroups = new Map<string, ImageInfo[]>();
  for (const img of images) {
    const day = (img.taken_at || img.created_at || "").slice(0, 10);
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(img);
  }

  // Flat list for viewer navigation
  const flatImages = [...dayGroups.values()].flat();

  return (
    <div>
      <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setExpanded((e) => !e)}>
        <span className={`w-10 text-sm text-right ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
          {monthNum}{t("timelineMonth")}
        </span>
        <div className="flex-1 flex items-center gap-2">
          <div className="h-6 rounded-md bg-blue-500/80 flex items-center px-2 min-w-[2rem] group-hover:bg-blue-400/80 transition-colors"
            style={{ width: `${barW}%` }}>
            <span className="text-xs text-white font-medium">{count}</span>
          </div>
          {locs.slice(0, 3).map((loc) => (
            <span key={loc} className={`text-xs px-1.5 py-0.5 rounded truncate max-w-[120px] ${isDark ? "bg-neutral-700/60 text-neutral-300" : "bg-neutral-100 text-neutral-600"}`}>
              📍{loc}
            </span>
          ))}
          <span className={`text-xs ${isDark ? "text-neutral-600" : "text-neutral-300"}`}>
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="ml-14 mt-2 mb-3 space-y-3">
          {[...dayGroups.entries()].map(([day, imgs]) => (
            <div key={day}>
              <p className={`text-xs mb-1.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{day}</p>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                {imgs.map((img) => {
                  const flatIdx = flatImages.indexOf(img);
                  return (
                    <img key={img.id} src={api.getThumbnailUrl(img.id)}
                      className="w-full aspect-square object-cover rounded cursor-pointer hover:ring-2 ring-blue-500 transition-all"
                      onClick={(e) => { e.stopPropagation(); setViewerIndex(flatIdx); }} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {viewerIndex !== null && flatImages[viewerIndex] && (
        <ImageViewer image={flatImages[viewerIndex]} onClose={() => setViewerIndex(null)}
          onPrev={viewerIndex > 0 ? () => setViewerIndex(viewerIndex - 1) : undefined}
          onNext={viewerIndex < flatImages.length - 1 ? () => setViewerIndex(viewerIndex + 1) : undefined} />
      )}
    </div>
  );
}

export default function TimelinePage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const [searchParams] = useSearchParams();
  const targetYear = searchParams.get("y");

  const { data } = useQuery({
    queryKey: ["timeline"],
    queryFn: () => api.getTimeline(),
    enabled: status === "ready",
  });

  const months = data?.months ?? [];
  const years = new Map<string, typeof months>();
  for (const m of months) {
    const y = m.month.slice(0, 4);
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(m);
  }
  const yearList = [...years.keys()];
  const maxCount = Math.max(...months.map((m) => m.count), 1);

  // Active year filter
  const [activeYear, setActiveYear] = useState<string | null>(targetYear);

  const toggleYear = (y: string) => {
    setActiveYear((prev) => (prev === y ? null : y));
  };

  const displayYears = activeYear ? (years.has(activeYear) ? [[activeYear, years.get(activeYear)!]] as const : []) : [...years.entries()];

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("timeline")}</h2>
        {yearList.length > 1 && (
          <div className="flex gap-1 mt-3 flex-wrap items-center">
            {yearList.map((y) => (
              <button key={y} onClick={() => toggleYear(y)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  activeYear === y
                    ? "bg-blue-500 text-white"
                    : isDark ? "bg-neutral-800 text-neutral-400 hover:text-white" : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"
                }`}>
                {y}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {displayYears.map(([year, items]) => {
          const yearTotal = items.reduce((s, m) => s + m.count, 0);
          const yearLocs = new Set(items.flatMap((m) => m.locations.split("|").filter(Boolean)));
          return (
            <div key={year} className="mb-8">
              <div className="flex items-baseline gap-3 mb-4">
                <h3 className="text-2xl font-bold">{year}</h3>
                <span className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  {yearTotal} {t("statsPhotos")}
                  {yearLocs.size > 0 && ` · ${yearLocs.size} ${t("statsCities")}`}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((m) => (
                  <MonthRow key={m.month} {...m} maxCount={maxCount} isDark={isDark} />
                ))}
              </div>
            </div>
          );
        })}
        {months.length === 0 && (
          <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {t("noResults")}
          </p>
        )}
      </div>
    </div>
  );
}
