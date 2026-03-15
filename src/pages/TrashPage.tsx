import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";

export default function TrashPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const queryClient = useQueryClient();
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => api.getTrash(),
    enabled: status === "ready",
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.restoreImage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });

  const emptyMutation = useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      setShowEmptyConfirm(false);
    },
  });

  const images = data?.images ?? [];
  const isEmpty = !isLoading && images.length === 0;

  return (
    <div className="flex flex-col h-full">
      <header className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("trash")}</h2>
        {images.length > 0 && (
          <button
            onClick={() => setShowEmptyConfirm(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg transition-colors"
          >
            {t("emptyTrash")}
          </button>
        )}
      </header>

      {/* Empty trash confirm dialog */}
      {showEmptyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEmptyConfirm(false)}>
          <div className={`rounded-xl p-5 w-80 shadow-2xl border ${isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`} onClick={(e) => e.stopPropagation()}>
            <p className={`text-sm mb-4 ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>{t("emptyTrashConfirm")}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEmptyConfirm(false)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${isDark ? "text-neutral-400 hover:text-white hover:bg-neutral-800" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"}`}
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => emptyMutation.mutate()}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-700 text-white hover:bg-red-600 transition-colors"
              >
                {t("emptyTrash")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-4xl opacity-20">🗑️</p>
            <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("noTrash")}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {images.map((img) => (
              <div key={img.id} className={`relative rounded-lg overflow-hidden border ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
                <img src={api.getThumbnailUrl(img.id)} alt="" className="w-full aspect-square object-cover opacity-60" />
                <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80">
                  <p className="text-xs text-neutral-300 truncate">{img.file_path.split("/").pop()}</p>
                </div>
                <button
                  onClick={() => restoreMutation.mutate(img.id)}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  {t("restoreBtn")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
