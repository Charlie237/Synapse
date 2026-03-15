import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import SearchBar from "../components/SearchBar";
import ImageGrid from "../components/ImageGrid";

const MODES = ["loose", "normal", "strict"] as const;
const MODE_KEYS = ["modeLoose", "modeNormal", "modeStrict"] as const;

export default function SearchPage() {
  const { status, modelsStatus } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const [query, setQuery] = useState("");
  const [modeIndex, setModeIndex] = useState(1);

  const modelsReady = status === "ready" && modelsStatus === "ready";
  const mode = MODES[modeIndex];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", query, mode, modelsReady],
    queryFn: () => api.search(query, 50, mode),
    enabled: modelsReady && query.length > 0,
    retry: 1,
  });

  const images = data?.results.map((r) => r.image) ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">{t("search")}</h2>
          <div className={`flex items-center rounded-lg p-0.5 ${isDark ? "bg-neutral-800" : "bg-neutral-100"}`}>
            {MODES.map((_, i) => (
              <button
                key={i}
                onClick={() => setModeIndex(i)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${
                  modeIndex === i
                    ? "bg-blue-600 text-white"
                    : isDark ? "text-neutral-400 hover:text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {t(MODE_KEYS[i])}
              </button>
            ))}
          </div>
        </div>
        <SearchBar onSearch={setQuery} isLoading={isFetching} disabled={!modelsReady} parsed={data?.parsed} />
      </header>

      {query && modelsReady && !isLoading && images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {t("noResults")} &ldquo;{query}&rdquo;
            {modeIndex > 0 && <span> &mdash; {t("tryLoose")}</span>}
          </p>
        </div>
      ) : (
        <ImageGrid images={images} />
      )}
    </div>
  );
}
