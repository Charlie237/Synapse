import { Routes, Route } from "react-router-dom";
import { BackendProvider, useBackend } from "./hooks/useBackend";
import { ThemeProvider, useTheme } from "./hooks/useTheme";
import { I18nProvider, useI18n } from "./hooks/useI18n";
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
  const { status, modelsStatus } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";

  const loading = status !== "ready" || modelsStatus !== "ready";
  const statusText =
    status !== "ready"
      ? t("loadingBackend")
      : modelsStatus === "loading" || modelsStatus === "not_loaded"
        ? t("loadingAI")
        : modelsStatus === "error"
          ? t("modelFailed")
          : "";

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
          <div className="text-center space-y-4">
            {modelsStatus !== "error" ? (
              <>
                <div className="relative w-16 h-16 mx-auto">
                  <div className={`absolute inset-0 rounded-full border-2 ${isDark ? "border-neutral-700" : "border-neutral-300"}`} />
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? "text-neutral-200" : "text-neutral-700"}`}>{statusText}</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("firstLaunch")}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-red-400 font-medium">{t("modelFailed")}</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("restartApp")}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
