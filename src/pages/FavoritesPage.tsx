import { useQuery } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import ImageGrid from "../components/ImageGrid";

export default function FavoritesPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";

  const { data, isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.getFavorites(),
    enabled: status === "ready",
  });

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
  const isEmpty = !isLoading && images.length === 0;

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("favorites")}</h2>
      </header>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-4xl opacity-20">&#9825;</p>
            <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("noFavorites")}</p>
            <p className={`text-xs ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>{t("favoriteTip")}</p>
          </div>
        </div>
      ) : (
        <ImageGrid images={images} />
      )}
    </div>
  );
}
