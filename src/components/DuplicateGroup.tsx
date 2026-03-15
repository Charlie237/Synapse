import { useState } from "react";
import { api, type DuplicateGroup as DupGroup } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import ImageViewer from "./ImageViewer";

interface Props {
  group: DupGroup;
  onResolve: (keepId: number, deleteIds: number[]) => void;
}

export default function DuplicateGroup({ group, onResolve }: Props) {
  const [selectedKeep, setSelectedKeep] = useState<Set<number>>(
    new Set([group.images[0]?.id])
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { resolved } = useTheme();
  const { locale } = useI18n();
  const isDark = resolved === "dark";

  const toggleKeep = (id: number) => {
    setSelectedKeep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleResolve = () => {
    const deleteIds = group.images
      .filter((img) => !selectedKeep.has(img.id))
      .map((img) => img.id);
    if (deleteIds.length === 0) return;
    const keepId = [...selectedKeep][0];
    onResolve(keepId, deleteIds);
  };

  const deleteCount = group.images.length - selectedKeep.size;

  return (
    <div className={`rounded-xl border p-4 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
          {group.images.length} {locale === "zh" ? "张相似图片" : "similar images"}
        </span>
        <button
          onClick={handleResolve}
          disabled={deleteCount === 0}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs rounded-lg transition-colors"
        >
          {locale === "zh" ? `删除 ${deleteCount} 张` : `Delete ${deleteCount} unchosen`}
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {group.images.map((img, idx) => {
          const kept = selectedKeep.has(img.id);
          return (
            <div
              key={img.id}
              onClick={() => toggleKeep(img.id)}
              className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                kept
                  ? "border-blue-500"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img
                src={api.getThumbnailUrl(img.id)}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-2">
                <p className="text-xs text-neutral-300 truncate">
                  {img.file_path.split("/").pop()}
                </p>
              </div>
              <div
                className={`absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                  kept ? "bg-blue-500" : "bg-black/50 border border-neutral-500"
                }`}
              >
                {kept && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setViewerIndex(idx); }}
                className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {viewerIndex !== null && group.images[viewerIndex] && (
        <ImageViewer
          image={group.images[viewerIndex]}
          onClose={() => setViewerIndex(null)}
          onPrev={viewerIndex > 0 ? () => setViewerIndex(viewerIndex - 1) : undefined}
          onNext={viewerIndex < group.images.length - 1 ? () => setViewerIndex(viewerIndex + 1) : undefined}
        />
      )}
    </div>
  );
}
