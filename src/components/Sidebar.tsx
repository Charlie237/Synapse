import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import CreateAlbumDialog from "./CreateAlbumDialog";

const icons: Record<string, string> = {
  grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  heart: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  copy: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
  album: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z",
  settings: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  map: "M9 6.75V15m6-6v8.25m.503-8.914l-4.006 2.003-4.994-2.497L3.75 7.5v9l2.753-1.158 4.994 2.497 4.006-2.003L18.25 14.5v-9l-2.747 1.336z",
  trash: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  timeline: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  stats: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
};

function SvgIcon({ name }: { name: string }) {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={icons[name]} />
    </svg>
  );
}

function NavItem({ to, label, icon, end, isDark }: { to: string; label: string; icon: string; end?: boolean; isDark: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? isDark ? "bg-white/10 text-white" : "bg-black/8 text-neutral-900"
            : isDark ? "text-neutral-400 hover:bg-white/5 hover:text-white" : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
        }`
      }
    >
      <SvgIcon name={icon} />
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);

  const libraryItems = [
    { to: "/", label: t("gallery"), icon: "grid" },
    { to: "/favorites", label: t("favorites"), icon: "heart" },
    { to: "/search", label: t("search"), icon: "search" },
    { to: "/map", label: t("map"), icon: "map" },
  ];

  const toolItems = [
    { to: "/timeline", label: t("timeline"), icon: "timeline" },
    { to: "/stats", label: t("stats"), icon: "stats" },
    { to: "/duplicates", label: t("duplicates"), icon: "copy" },
    { to: "/trash", label: t("trash"), icon: "trash" },
  ];

  const { data: albumsData } = useQuery({
    queryKey: ["albums"],
    queryFn: () => api.getAlbums(),
    enabled: status === "ready",
  });

  const albums = albumsData?.albums ?? [];

  return (
    <aside className={`w-52 flex flex-col shrink-0 border-r ${isDark ? "border-neutral-800 bg-neutral-900/50" : "border-neutral-200 bg-neutral-50"}`}>
      <div className="p-4 pt-6">
        <h1 className="text-lg font-semibold tracking-tight">Synapse</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-2">
          <p className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {t("library")}
          </p>
          <div className="space-y-0.5">
            {libraryItems.map((item) => (
              <NavItem key={item.to} {...item} end={item.to === "/"} isDark={isDark} />
            ))}
          </div>
        </div>

        <div className="mb-2">
          <p className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
            {t("tools")}
          </p>
          <div className="space-y-0.5">
            {toolItems.map((item) => (
              <NavItem key={item.to} {...item} isDark={isDark} />
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between px-3 py-1">
            <p className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {t("albums")}
            </p>
            <button
              onClick={() => setShowCreateAlbum(true)}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isDark ? "text-neutral-500 hover:text-white hover:bg-white/10" : "text-neutral-400 hover:text-neutral-900 hover:bg-black/10"}`}
              title={t("newAlbum")}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5">
            {albums.map((album) => (
              <NavItem key={album.id} to={`/albums/${album.id}`} label={album.name} icon="album" isDark={isDark} />
            ))}
            {albums.length === 0 && (
              <p className={`px-3 py-1 text-xs ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>{t("noAlbums")}</p>
            )}
          </div>
        </div>
      </div>

      <div className={`border-t ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <div className="px-2 py-1.5">
          <NavItem to="/settings" label={t("settings")} icon="settings" isDark={isDark} />
        </div>
      </div>

      <CreateAlbumDialog open={showCreateAlbum} onClose={() => setShowCreateAlbum(false)} />
    </aside>
  );
}
