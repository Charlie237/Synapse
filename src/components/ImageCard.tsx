import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ImageInfo } from "../api/client";

interface Props {
  image: ImageInfo;
  sortBy?: string;
  onClick?: () => void;
}

function getSortLabel(image: ImageInfo, sortBy?: string): string {
  switch (sortBy) {
    case "taken_at":
      return image.taken_at ? new Date(image.taken_at).toLocaleDateString() : "";
    case "created_at":
      return new Date(image.created_at.endsWith("Z") ? image.created_at : image.created_at + "Z").toLocaleDateString();
    case "file_size":
      return image.file_size ? `${(image.file_size / 1024 / 1024).toFixed(1)} MB` : "";
    case "file_path":
      return image.file_path.split("/").pop() || "";
    default:
      return "";
  }
}

export default function ImageCard({ image, sortBy, onClick }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [isFav, setIsFav] = useState(image.is_favorite);
  const queryClient = useQueryClient();

  useEffect(() => { setIsFav(image.is_favorite); }, [image.is_favorite]);

  const favMutation = useMutation({
    mutationFn: () => api.toggleFavorite(image.id),
    onMutate: () => {
      setIsFav((prev) => (prev ? 0 : 1));
    },
    onSuccess: (data) => {
      setIsFav(data.is_favorite);
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
    onError: () => {
      setIsFav(image.is_favorite);
    },
  });

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    favMutation.mutate();
  };

  return (
    <div
      className="relative aspect-square bg-neutral-800 rounded overflow-hidden group cursor-pointer"
      onClick={onClick}
    >
      <img
        src={api.getThumbnailUrl(image.id)}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {!loaded && (
        <div className="absolute inset-0 bg-neutral-800 animate-pulse" />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

      {/* Sort info on hover */}
      {sortBy && getSortLabel(image, sortBy) && (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-white text-[11px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {getSortLabel(image, sortBy)}
        </div>
      )}

      {/* Favorite heart */}
      <button
        onClick={handleFavorite}
        className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full transition-all ${
          isFav
            ? "bg-red-500/80 text-white opacity-100"
            : "bg-black/40 text-white opacity-0 group-hover:opacity-100"
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </button>
    </div>
  );
}
