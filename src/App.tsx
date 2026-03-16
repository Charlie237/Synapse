import { Routes, Route, useNavigate } from "react-router-dom";
import { BackendProvider, useBackend } from "./hooks/useBackend";
import { ThemeProvider, useTheme } from "./hooks/useTheme";
import { I18nProvider, useI18n } from "./hooks/useI18n";
import { api } from "./api/client";
import Sidebar from "./components/Sidebar";
import GalleryPage from "./pages/GalleryPage";
import FavoritesPage from "./pages/FavoritesPage";
import SearchPage from "./pages/SearchPage";
import DuplicatesPage from "./pages/DuplicatesPage";
import AlbumPage from "./pages/AlbumPage";
import SettingsPage from "./pages/SettingsPage";
import MapPage from "./pages/MapPage";
import TrashPage from "./pages/TrashPage";
import TimelinePage from "./pages/TimelinePage";
import StatsPage from "./pages/StatsPage";

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <BackendProvider>
          <AppContent />
        </BackendProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

function AppContent() {
  const { status, modelsStatus, downloadProgress, error } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const navigate = useNavigate();

  const loading = status !== "ready" || modelsStatus !== "ready";
  const statusText =
    status !== "ready"
      ? t("loadingBackend")
      : downloadProgress
        ? t("downloadingModels")
        : modelsStatus === "loading" || modelsStatus === "not_loaded" || modelsStatus === "downloading"
          ? t("loadingAI")
          : modelsStatus === "error"
            ? t("modelFailed")
            : "";

  const dlPct = downloadProgress?.total
    ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
    : 0;

  return (
    <div className={`flex h-screen overflow-hidden relative ${isDark ? "bg-neutral-950 text-white" : "bg-white text-neutral-900"}`}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/duplicates" element={<DuplicatesPage />} />
          <Route path="/albums/:albumId" element={<AlbumPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {loading && (
        <div className={`absolute inset-0 z-50 backdrop-blur-sm flex items-center justify-center ${isDark ? "bg-neutral-950/80" : "bg-white/80"}`}>
          <div className="text-center space-y-4 max-w-sm mx-4">

            {/* Need download — prompt user */}
            {modelsStatus === "need_download" ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-neutral-700"}`}>{t("modelsNotFound")}</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("modelsNotFoundDesc")}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => api.downloadModels()}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    {t("downloadModels")}
                  </button>
                  <button onClick={() => navigate("/settings")}
                    className={`px-4 py-2 text-sm rounded-lg border transition-colors ${isDark ? "border-neutral-700 text-neutral-400 hover:text-white" : "border-neutral-300 text-neutral-500 hover:text-neutral-900"}`}>
                    {t("goToSettings")}
                  </button>
                </div>
              </>

            /* Error */
            ) : modelsStatus === "error" ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-red-400 font-medium">{t("modelFailed")}</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                    {error || t("restartApp")}
                  </p>
                </div>
                <button onClick={() => api.downloadModels()}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  {t("retryDownload")}
                </button>
              </>

            /* Loading / downloading */
            ) : (
              <>
                <div className="relative w-16 h-16 mx-auto">
                  <div className={`absolute inset-0 rounded-full border-2 ${isDark ? "border-neutral-700" : "border-neutral-300"}`} />
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-neutral-700"}`}>{statusText}</p>
                  {downloadProgress?.total ? (
                    <div className="mt-2 w-48 mx-auto">
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}>
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${dlPct}%` }} />
                      </div>
                      <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                        {Math.round(downloadProgress.downloaded / 1024 / 1024)}MB / {Math.round(downloadProgress.total / 1024 / 1024)}MB
                      </p>
                    </div>
                  ) : (
                    <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("firstLaunch")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
