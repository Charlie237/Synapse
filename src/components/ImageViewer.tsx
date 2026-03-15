import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ImageInfo } from "../api/client";
import { useI18n } from "../hooks/useI18n";

interface Props {
  image: ImageInfo;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onFavoriteToggled?: (imageId: number, isFavorite: number) => void;
  onNavigateToImage?: (imageId: number) => void;
  onDeleted?: (imageId: number) => void;
}

export default function ImageViewer({ image, onClose, onPrev, onNext, onFavoriteToggled, onNavigateToImage, onDeleted }: Props) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isFav, setIsFav] = useState(image.is_favorite);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const albumMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const zoomIn = useCallback(() => setScale((s) => Math.min(s * 1.3, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s / 1.3, 0.2)), []);
  const rotateRight = useCallback(() => setRotation((r) => r + 90), []);
  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
  }, []);

  const favMutation = useMutation({
    mutationFn: () => api.toggleFavorite(image.id),
    onSuccess: (data) => {
      setIsFav(data.is_favorite);
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      onFavoriteToggled?.(image.id, data.is_favorite);
    },
  });

  const toggleFavorite = useCallback(() => {
    favMutation.mutate();
  }, [favMutation]);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteImage(image.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      onDeleted?.(image.id);
      onClose();
    },
  });

  const { data: albumsData } = useQuery({
    queryKey: ["albums"],
    queryFn: () => api.getAlbums(),
    enabled: showAlbumMenu,
  });

  const addToAlbumMutation = useMutation({
    mutationFn: (albumId: number) => api.addToAlbum(albumId, [image.id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setShowAlbumMenu(false);
    },
  });

  const { data: similarData } = useQuery({
    queryKey: ["similar", image.id],
    queryFn: () => api.getSimilarImages(image.id),
    enabled: showSimilar,
  });

  // Close album menu when clicking outside
  useEffect(() => {
    if (!showAlbumMenu) return;
    const handler = (e: MouseEvent) => {
      if (albumMenuRef.current && !albumMenuRef.current.contains(e.target as Node)) {
        setShowAlbumMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAlbumMenu]);

  // Reset on image change
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setLoaded(false);
    setIsFav(image.is_favorite);
    setShowAlbumMenu(false);
    setShowSimilar(false);
    setShowInfo(false);
    setReview(null);
    setReviewing(false);
    setShowDeleteConfirm(false);
  }, [image.id, image.is_favorite]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          if (showAlbumMenu) {
            setShowAlbumMenu(false);
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          onPrev?.();
          break;
        case "ArrowRight":
          onNext?.();
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
        case "r":
          rotateRight();
          break;
        case "0":
          resetView();
          break;
        case "f":
          toggleFavorite();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, zoomIn, zoomOut, rotateRight, resetView, toggleFavorite, showAlbumMenu]);

  // Scroll wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    },
    [zoomIn, zoomOut],
  );

  const fileName = image.file_path.split("/").pop() ?? "";
  const fileSize = image.file_size
    ? `${(image.file_size / 1024 / 1024).toFixed(1)} MB`
    : "";

  const albums = albumsData?.albums ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm text-neutral-300 truncate">{fileName}</span>
          <span className="text-xs text-neutral-500 shrink-0">
            {image.width}x{image.height} &middot; {fileSize}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Favorite */}
          <button
            onClick={toggleFavorite}
            title="Favorite (F)"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              isFav
                ? "text-red-500 hover:text-red-400"
                : "text-neutral-400 hover:text-white"
            } hover:bg-neutral-800`}
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </button>
          {/* Add to album */}
          <div className="relative" ref={albumMenuRef}>
            <button
              onClick={() => setShowAlbumMenu(!showAlbumMenu)}
              title="Add to album"
              className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </button>
            {showAlbumMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 z-20">
                {albums.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-neutral-500">No albums yet</p>
                ) : (
                  albums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => addToAlbumMutation.mutate(album.id)}
                      className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"
                    >
                      {album.name}
                      <span className="text-neutral-500 ml-1 text-xs">{album.image_count}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {/* Divider */}
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          {/* Zoom out */}
          <ToolButton onClick={zoomOut} title="Zoom out (-)">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"
            />
          </ToolButton>
          {/* Zoom level */}
          <button
            onClick={resetView}
            className="text-xs text-neutral-400 hover:text-white px-2 py-1 min-w-[48px] text-center"
            title="Reset (0)"
          >
            {Math.round(scale * 100)}%
          </button>
          {/* Zoom in */}
          <ToolButton onClick={zoomIn} title="Zoom in (+)">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
            />
          </ToolButton>
          {/* Rotate */}
          <ToolButton onClick={rotateRight} title="Rotate (R)">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </ToolButton>
          {/* Divider */}
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          {/* AI Review */}
          <ToolButton
            onClick={async () => {
              if (review || reviewing) return;
              setReviewing(true);
              try {
                const res = await api.reviewImage(image.id);
                setReview(res.review);
              } catch {
                setReview(t("reviewFailed"));
              } finally {
                setReviewing(false);
              }
            }}
            title={t("aiReview")}
          >
            {reviewing ? (
              <circle cx="12" cy="12" r="9" strokeDasharray="20 40" className="animate-spin origin-center" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            )}
          </ToolButton>
          {/* Info */}
          <ToolButton onClick={() => setShowInfo((s) => !s)} title={t("info")}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </ToolButton>
          {/* Delete */}
          <ToolButton onClick={() => setShowDeleteConfirm(true)} title={t("deleteBtn")}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </ToolButton>
          {/* Divider */}
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          {/* Close */}
          <ToolButton onClick={onClose} title="Close (Esc)">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </ToolButton>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex overflow-hidden relative">
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden relative"
          onWheel={handleWheel}
        >
        {/* Prev/Next arrows */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}

        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          src={api.getOriginalUrl(image.id)}
          alt={fileName}
          onLoad={() => setLoaded(true)}
          className="max-w-none transition-transform duration-150 select-none"
          draggable={false}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            opacity: loaded ? 1 : 0,
            maxHeight: scale <= 1 ? "100%" : "none",
            maxWidth: scale <= 1 ? "100%" : "none",
          }}
        />
      </div>

      {/* Info panel */}
      {showInfo && <InfoPanel image={image} t={t} />}
      {review && (
        <div className="absolute top-16 left-4 max-w-sm bg-black/80 backdrop-blur rounded-lg p-4 text-sm text-neutral-200 leading-relaxed z-10">
          <div className="flex justify-between items-start mb-1">
            <span className="text-xs text-neutral-400">✨ {t("aiReview")}</span>
            <button onClick={() => setReview(null)} className="text-neutral-500 hover:text-white text-xs">✕</button>
          </div>
          {review}
        </div>
      )}
      </div>

      {/* Similar images panel */}
      <div className="border-t border-neutral-800 bg-black/60">
        <button
          onClick={() => setShowSimilar((s) => !s)}
          className="w-full px-4 py-2 text-sm text-neutral-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <span>{showSimilar ? "▼" : "▶"}</span>
          {t("similarImages")}
        </button>
        {showSimilar && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
            {similarData?.results.length === 0 && (
              <p className="text-xs text-neutral-500 py-2">{t("noSimilar")}</p>
            )}
            {similarData?.results.map((r) => (
              <img
                key={r.image_id}
                src={api.getThumbnailUrl(r.image_id)}
                className="w-20 h-20 object-cover rounded cursor-pointer hover:ring-2 ring-blue-500 shrink-0"
                onClick={() => onNavigateToImage?.(r.image_id)}
                title={`Score: ${r.score.toFixed(3)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-neutral-200 mb-4">{t("deleteConfirm")}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); deleteMutation.mutate(); }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                {t("deleteBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoPanel({ image, t }: { image: ImageInfo; t: (k: any) => string }) {
  const { data } = useQuery({
    queryKey: ["image-detail", image.id],
    queryFn: () => api.getImage(image.id),
    staleTime: 5 * 60 * 1000,
    initialData: image.location_name !== undefined && image.location_name !== null ? image : undefined,
  });
  const img = data ?? image;
  const fileName = img.file_path.split("/").pop() ?? "";
  const fileSize = img.file_size ? `${(img.file_size / 1024 / 1024).toFixed(1)} MB` : "";

  return (
    <div className="w-72 border-l border-neutral-800 bg-black/80 overflow-y-auto p-4 space-y-4 shrink-0">
      <h3 className="text-sm font-medium text-neutral-200">{t("details")}</h3>
      <InfoRow label={t("fileName")} value={fileName} />
      <InfoRow label={t("dimensions")} value={`${img.width} × ${img.height}`} />
      <InfoRow label={t("fileSize")} value={fileSize} />
      <InfoRow label={t("dateTaken")} value={img.taken_at ? new Date(img.taken_at).toLocaleString() : t("unknown")} />
      <InfoRow label={t("dateImported")} value={new Date(img.created_at.endsWith("Z") ? img.created_at : img.created_at + "Z").toLocaleString()} />
      {img.camera_model && <InfoRow label={t("camera")} value={[img.camera_make, img.camera_model].filter(Boolean).join(" ")} />}
      {img.lens_model && <InfoRow label={t("lens")} value={img.lens_model} />}
      {(img.focal_length || img.aperture || img.iso) && (
        <InfoRow label={t("exposure")} value={[
          img.focal_length ? `${img.focal_length}mm` : null,
          img.aperture ? `ƒ/${img.aperture}` : null,
          img.iso ? `ISO ${img.iso}` : null,
        ].filter(Boolean).join("  ")} />
      )}
      <InfoRow label={t("location")} value={
        img.location_name
          ? img.location_name
          : img.latitude != null
            ? `${img.latitude.toFixed(5)}, ${img.longitude!.toFixed(5)}`
            : t("unknown")
      } />
      <InfoRow label={t("filePath")} value={img.file_path} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-neutral-300 break-all mt-0.5">{value}</p>
    </div>
  );
}

function ToolButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
    >
      <svg
        className="w-4.5 h-4.5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        {children}
      </svg>
    </button>
  );
}
