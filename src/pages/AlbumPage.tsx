import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import ImageGrid from "../components/ImageGrid";

export default function AlbumPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number(albumId);

  const { data, isLoading } = useQuery({
    queryKey: ["album", id],
    queryFn: () => api.getAlbum(id),
    enabled: status === "ready" && !isNaN(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAlbum(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      navigate("/");
    },
  });

  if (status !== "ready" || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("albumNotFound")}</p>
      </div>
    );
  }

  const images = data.images ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">{data.name}</h2>
          <span className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {images.length} {images.length === 1 ? t("photo") : t("photos")}
          </span>
        </div>
        <button
          onClick={() => { if (confirm(`Delete album "${data.name}"?`)) deleteMutation.mutate(); }}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          {t("deleteAlbum")}
        </button>
      </header>

      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("albumEmpty")}</p>
        </div>
      ) : (
        <ImageGrid images={images} />
      )}
    </div>
  );
}
