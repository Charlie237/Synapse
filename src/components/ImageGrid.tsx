import { useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import ImageCard from "./ImageCard";
import ImageViewer from "./ImageViewer";
import type { ImageInfo } from "../api/client";

interface Props {
  images: ImageInfo[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  sortBy?: string;
}

export default function ImageGrid({ images, hasMore, onLoadMore, sortBy }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="pt-3" style={{ flexGrow: 1 }}>
        <VirtuosoGrid
          style={{ height: "100%" }}
          totalCount={images.length}
          overscan={200}
          listClassName="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1 px-6"
          itemContent={(index) => {
          const img = images[index];
          return (
            <ImageCard
              key={img.id}
              image={img}
              sortBy={sortBy}
              onClick={() => setViewerIndex(index)}
            />
          );
        }}
        endReached={() => {
          if (hasMore && onLoadMore) onLoadMore();
        }}
      />
      </div>

      {viewerIndex !== null && images[viewerIndex] && (
        <ImageViewer
          image={images[viewerIndex]}
          onClose={() => setViewerIndex(null)}
          onPrev={
            viewerIndex > 0
              ? () => setViewerIndex(viewerIndex - 1)
              : undefined
          }
          onNext={
            viewerIndex < images.length - 1
              ? () => setViewerIndex(viewerIndex + 1)
              : undefined
          }
        />
      )}
    </>
  );
}
