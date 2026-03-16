let cachedBaseUrl: string | null = null;

export function setBackendPort(port: number) {
  cachedBaseUrl = `http://127.0.0.1:${port}`;
}

function getBaseUrl(): string {
  if (!cachedBaseUrl) throw new Error("Backend port not set");
  return cachedBaseUrl;
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  modelsStatus: () =>
    request<{
      status: string;
      error?: string;
      models?: Record<string, string>;
      download?: { downloading: boolean; downloaded: number; total: number };
    }>("/api/models/status"),
  downloadModels: () =>
    request<{ ok: boolean }>("/api/models/download", { method: "POST" }),

  // Library
  scanFolder: (folderPath: string) =>
    request<{ job_id: number }>("/api/library/scan", {
      method: "POST",
      body: JSON.stringify({ folder_path: folderPath }),
    }),
  getScanStatus: (jobId?: number) =>
    request<{
      id: number;
      status: string;
      total: number;
      processed: number;
      no_exif?: number;
    }>(`/api/library/scan/status${jobId ? `?job_id=${jobId}` : ""}`),

  refreshMetadata: () =>
    request<{ total: number; updated_gps: number }>("/api/library/refresh-metadata", { method: "POST" }),

  resetLibrary: () =>
    request<{ ok: boolean }>("/api/reset-library", { method: "POST" }),

  removeFolder: (folder: string) =>
    request<{ ok: boolean; removed: number }>("/api/remove-folder", {
      method: "POST",
      body: JSON.stringify({ folder }),
    }),

  // Settings
  getSettings: () => request<Record<string, string>>("/api/settings"),
  updateSettings: (data: Record<string, string>) =>
    request<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Timeline & Stats
  getTimeline: () => request<{ months: TimelineMonth[] }>("/api/timeline"),
  getTimelineMonth: (month: string) =>
    request<{ images: ImageInfo[] }>(`/api/timeline/${month}`),
  getStats: (dateFrom?: string, dateTo?: string) => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    const q = p.toString();
    return request<StatsData>(`/api/stats${q ? `?${q}` : ""}`);
  },

  // Images
  getImages: (page = 1, size = 50, sortBy = "created_at", sortOrder = "desc", filters?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(page), size: String(size), sort_by: sortBy, sort_order: sortOrder });
    if (filters) Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return request<{
      images: ImageInfo[];
      total: number;
      page: number;
      pages: number;
    }>(`/api/images?${params}`);
  },
  getImage: (id: number) => request<ImageInfo>(`/api/images/${id}`),
  getFilterOptions: () => request<{ cameras: string[]; lenses: string[]; locations: string[]; focal_lengths: number[] }>("/api/images/filters"),
  getGroupedImages: (groupBy: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams({ group_by: groupBy });
    if (filters) Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return request<{ groups: { label: string; count: number; images: ImageInfo[] }[] }>(`/api/images/grouped?${params}`);
  },
  getThumbnailUrl: (id: number) => `${getBaseUrl()}/api/images/${id}/thumbnail`,
  getOriginalUrl: (id: number) => `${getBaseUrl()}/api/images/${id}/original`,
  deleteImage: (id: number) =>
    request<void>(`/api/images/${id}`, { method: "DELETE" }),

  // Search
  search: (query: string, limit = 50, mode = "normal") =>
    request<{ results: SearchResult[]; parsed: ParsedQuery }>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query, limit, mode }),
    }),

  // Duplicates
  getDuplicates: () =>
    request<{ groups: DuplicateGroup[] }>("/api/duplicates"),
  resolveDuplicates: (keepId: number, deleteIds: number[]) =>
    request<void>("/api/duplicates/resolve", {
      method: "POST",
      body: JSON.stringify({ keep_id: keepId, delete_ids: deleteIds }),
    }),

  // Favorites
  toggleFavorite: (id: number) =>
    request<{ is_favorite: number }>(`/api/images/${id}/favorite`, {
      method: "POST",
    }),
  getFavorites: () =>
    request<{ images: ImageInfo[] }>("/api/favorites"),

  // Albums
  createAlbum: (name: string) =>
    request<{ id: number }>("/api/albums", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getAlbums: () =>
    request<{ albums: Album[] }>("/api/albums"),
  getAlbum: (id: number) =>
    request<Album & { images: ImageInfo[] }>(`/api/albums/${id}`),
  renameAlbum: (id: number, name: string) =>
    request<void>(`/api/albums/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  deleteAlbum: (id: number) =>
    request<void>(`/api/albums/${id}`, { method: "DELETE" }),
  addToAlbum: (albumId: number, imageIds: number[]) =>
    request<void>(`/api/albums/${albumId}/images`, {
      method: "POST",
      body: JSON.stringify({ image_ids: imageIds }),
    }),
  removeFromAlbum: (albumId: number, imageIds: number[]) =>
    request<void>(`/api/albums/${albumId}/images`, {
      method: "DELETE",
      body: JSON.stringify({ image_ids: imageIds }),
    }),

  // Map
  getMapImages: () =>
    request<{ images: MapImage[] }>("/api/map/images"),

  // Similar
  getSimilarImages: (id: number, limit = 12) =>
    request<{ results: SimilarImage[] }>(`/api/images/${id}/similar?limit=${limit}`),

  // AI Review
  reviewImage: (id: number) =>
    request<{ review: string }>(`/api/images/${id}/review`, { method: "POST" }),

  // Trash
  getTrash: () =>
    request<{ images: ImageInfo[] }>("/api/trash"),
  restoreImage: (id: number) =>
    request<void>(`/api/trash/${id}/restore`, { method: "POST" }),
  permanentlyDelete: (id: number) =>
    request<void>(`/api/trash/${id}`, { method: "DELETE" }),
  emptyTrash: () =>
    request<{ count: number }>("/api/trash", { method: "DELETE" }),
};

export interface ImageInfo {
  id: number;
  file_path: string;
  file_size: number;
  width: number;
  height: number;
  format: string;
  taken_at: string | null;
  created_at: string;
  is_favorite: number;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  focal_length: number | null;
  aperture: number | null;
  iso: number | null;
}

export interface ParsedQuery {
  date_from: string | null;
  date_to: string | null;
  locations: string[];
  visual: string;
  original: string;
}

export interface SearchResult {
  image: ImageInfo;
  score: number;
}

export interface DuplicateGroup {
  id: number;
  images: (ImageInfo & { similarity: number })[];
}

export interface Album {
  id: number;
  name: string;
  created_at: string;
  image_count: number;
  cover_thumbnail: string | null;
}

export interface MapImage {
  id: number;
  latitude: number;
  longitude: number;
  thumbnail: string | null;
}

export interface SimilarImage {
  image_id: number;
  score: number;
}

export interface TimelineMonth {
  month: string;
  count: number;
  locations: string;
}

export interface StatsData {
  total: number;
  favorites: number;
  cities: number;
  earliest: string | null;
  latest: string | null;
  total_size: number;
  monthly: { month: string; count: number }[];
  top_locations: { name: string; count: number }[];
  hours: { hour: number; count: number }[];
  top_cameras: { name: string; count: number }[];
  top_lenses: { name: string; count: number }[];
  focal_lengths: { fl: number; count: number }[];
}
