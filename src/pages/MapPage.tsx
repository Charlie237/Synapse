import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const { data } = useQuery({
    queryKey: ["mapImages"],
    queryFn: () => api.getMapImages(),
    enabled: status === "ready",
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current).setView([30, 104], 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapInstance.current);
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !data?.images) return;
    map.eachLayer((l) => { if (l instanceof L.Marker) map.removeLayer(l); });
    const bounds: L.LatLngTuple[] = [];
    for (const img of data.images) {
      const latlng: L.LatLngTuple = [img.latitude, img.longitude];
      const marker = L.marker(latlng).addTo(map);
      const thumbUrl = api.getThumbnailUrl(img.id);
      marker.bindPopup(`<img src="${thumbUrl}" style="max-width:200px;max-height:200px;" />`);
      bounds.push(latlng);
    }
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("map")}</h2>
      </header>
      <div ref={mapRef} className="flex-1" />
    </div>
  );
}
