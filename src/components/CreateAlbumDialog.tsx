import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateAlbumDialog({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";

  const mutation = useMutation({
    mutationFn: () => api.createAlbum(name.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setName("");
      onClose();
    },
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className={`rounded-xl p-5 w-80 space-y-4 border ${isDark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}
      >
        <h3 className="text-sm font-medium">{t("newAlbum")}</h3>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("albumName")}
          className={`w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:border-blue-500 border
                     ${isDark ? "bg-neutral-800 border-neutral-700 placeholder:text-neutral-500" : "bg-neutral-50 border-neutral-300 placeholder:text-neutral-400"}`}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setName(""); onClose(); }}
            className={`px-3 py-1.5 text-sm transition-colors ${isDark ? "text-neutral-400 hover:text-white" : "text-neutral-500 hover:text-neutral-900"}`}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || mutation.isPending}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("create")}
          </button>
        </div>
      </form>
    </div>
  );
}
