import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import ImageGrid from "../components/ImageGrid";
import ImportProgress from "../components/ImportProgress";

const SORT_KEYS = ["created_at", "taken_at", "file_size", "file_path"] as const;
const SORT_LABEL_KEYS = ["sortCreatedAt", "sortTakenAt", "sortFileSize", "sortFilePath"] as const;

function FilterPanel({ isDark, filters, filterOpts, setFilter, t, onClose }: {
  isDark: boolean;
  filters: Record<string, string>;
  filterOpts: { cameras: string[]; lenses: string[]; locations: string[]; focal_lengths: number[] } | undefined;
  setFilter: (k: string, v: string) => void;
  t: (k: any) => string;
  onClose: () => void;
}) {
  const sections = [
    { key: "camera", label: t("filterCamera"), opts: filterOpts?.cameras ?? [] },
    { key: "lens", label: t("filterLens"), opts: filterOpts?.lenses ?? [] },
    { key: "location", label: t("filterLocation"), opts: filterOpts?.locations ?? [] },
    { key: "focal_length", label: t("filterFocal"), opts: (filterOpts?.focal_lengths ?? []).map(String) },
  ];

  const toggle = (key: string, val: string) => {
    const current = filters[key] ? filters[key].split("|") : [];
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
    setFilter(key, next.join("|"));
  };

  const itemClass = (active: boolean) =>
    `px-2.5 py-1 text-xs rounded-md cursor-pointer transition-colors ${
      active
        ? "bg-blue-600 text-white"
        : isDark ? "bg-neutral-700/50 text-neutral-300 hover:bg-neutral-700" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
    }`;

  return (
    <div className={`absolute right-0 top-full mt-1 z-50 w-80 max-h-[28rem] overflow-y-auto rounded-xl shadow-xl border p-3 space-y-3 ${isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}>
      {sections.map((s) => s.opts.length > 0 && (
        <div key={s.key}>
          <p className={`text-[10px] font-medium uppercase tracking-wider mb-1.5 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{s.label}</p>
          <div className="flex flex-wrap gap-1">
            {s.opts.map((v) => {
              const selected = (filters[s.key] || "").split("|").includes(v);
              return (
                <span key={v} onClick={() => toggle(s.key, v)} className={itemClass(selected)}>
                  {s.key === "focal_length" ? `${v}mm` : v}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(filters).some((k) => filters[k]) && (
        <button onClick={() => { for (const k of Object.keys(filters)) setFilter(k, ""); onClose(); }}
          className={`text-xs w-full py-1.5 rounded-lg ${isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50"}`}>
          {t("clearFilter")}
        </button>
      )}
    </div>
  );
}

export default function GalleryPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanJobId, setScanJobId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filters from URL
  const filters: Record<string, string> = {};
  for (const k of ["camera", "lens", "location", "focal_length"]) {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  }
  const hasFilter = Object.values(filters).some(Boolean);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const [showFilter, setShowFilter] = useState(false);

  const { data: filterOpts } = useQuery({
    queryKey: ["filterOptions"],
    queryFn: () => api.getFilterOptions(),
    enabled: status === "ready",
  });

  // Normal list query
  const { data, isLoading } = useQuery({
    queryKey: ["images", page, SORT_KEYS[sortBy], sortOrder, filters],
    queryFn: () => api.getImages(page, 100, SORT_KEYS[sortBy], sortOrder, hasFilter ? filters : undefined),
    enabled: status === "ready",
  });

  const handleImport = useCallback(async () => {
    const folder = await open({ directory: true, multiple: false });
    if (!folder) return;
    const result = await api.scanFolder(folder as string);
    setScanJobId(result.job_id);
  }, []);

  const handleImportComplete = useCallback(() => {
    setScanJobId(null);
    queryClient.invalidateQueries({ queryKey: ["images"] });
  }, [queryClient]);

  if (status !== "ready") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>{t("startingBackend")}</p>
        </div>
      </div>
    );
  }

  const images = data?.images ?? [];
  const isEmpty = !isLoading && images.length === 0 && !scanJobId && !hasFilter;

  const pillBase = `px-3 py-1.5 text-xs rounded-full transition-colors font-medium`;
  const pillActive = isDark ? "bg-white/15 text-white" : "bg-neutral-900 text-white";
  const pillInactive = isDark ? "text-neutral-400 hover:bg-white/8 hover:text-neutral-200" : "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700";

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("gallery")}</h2>
          <button onClick={handleImport}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            {t("importFolder")}
          </button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            {/* Sort */}
            <div className={`inline-flex items-center p-1 rounded-full shrink-0 ${isDark ? "bg-neutral-800/80" : "bg-neutral-100"}`}>
              {SORT_KEYS.map((_, i) => (
                <button key={i} onClick={() => { setSortBy(i); setPage(1); }}
                  className={`${pillBase} ${sortBy === i ? pillActive : pillInactive}`}>
                  {t(SORT_LABEL_KEYS[i])}
                </button>
              ))}
            </div>
            <button onClick={() => { setSortOrder((o) => o === "asc" ? "desc" : "asc"); setPage(1); }}
              className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors ${isDark ? "bg-neutral-800/80 text-neutral-400 hover:text-white" : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"}`}
              title={sortOrder === "asc" ? t("ascending") : t("descending")}>
              <span className="text-base">{sortOrder === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>

          {/* Filter button with badge */}
          <div className="relative shrink-0">
            <button onClick={() => setShowFilter((v) => !v)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${hasFilter ? "bg-blue-600 text-white" : isDark ? "bg-neutral-800/80 text-neutral-400 hover:text-white" : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
              </svg>
            </button>
            {hasFilter && (
              <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {Object.values(filters).filter(Boolean).reduce((n, v) => n + v.split("|").length, 0)}
              </span>
            )}
            {showFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilter(false)} />
                <FilterPanel isDark={isDark} filters={filters} filterOpts={filterOpts} setFilter={setParam} t={t} onClose={() => setShowFilter(false)} />
              </>
            )}
          </div>
        </div>
      </header>

      {scanJobId && <ImportProgress jobId={scanJobId} onComplete={handleImportComplete} />}

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md text-center space-y-6 px-6">
            <div className="text-5xl">🦕</div>
            <h2 className="text-xl font-semibold">{t("welcomeTitle")}</h2>
            <div className={`text-sm space-y-3 text-left ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
              <p className="flex gap-2"><span className="shrink-0">1️⃣</span><span>{t("guideStep1")}</span></p>
              <p className="flex gap-2"><span className="shrink-0">2️⃣</span><span>{t("guideStep2")}</span></p>
              <p className="flex gap-2"><span className="shrink-0">3️⃣</span><span>{t("guideStep3")}</span></p>
            </div>
            <button onClick={handleImport}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
              {t("importAFolder")}
            </button>
          </div>
        </div>
      ) : !isLoading && images.length === 0 && hasFilter ? (
        <div className="flex-1 flex items-center justify-center">
          <p className={isDark ? "text-neutral-500" : "text-neutral-400"}>{t("noResults")}</p>
        </div>
      ) : (
        <ImageGrid images={images}
          sortBy={SORT_KEYS[sortBy]}
          hasMore={(data?.page ?? 0) < (data?.pages ?? 0)}
          onLoadMore={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  );
}
