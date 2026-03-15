import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { useBackend } from "../hooks/useBackend";
import { api } from "../api/client";

const themeOptions = ["dark", "light", "system"] as const;
const themeKeys = ["themeDark", "themeLight", "themeSystem"] as const;

export default function SettingsPage() {
  const { themeSetting, setTheme, resolved } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const isDark = resolved === "dark";
  const queryClient = useQueryClient();
  const { status, modelsStatus, port } = useBackend();

  const [searchMode, setSearchMode] = useState("local");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [visionKey, setVisionKey] = useState("");
  const [visionUrl, setVisionUrl] = useState("");
  const [visionModel, setVisionModel] = useState("gpt-4o");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    api.getSettings().then((s) => {
      setSearchMode(s.search_mode || "local");
      setApiKey(s.openai_api_key_masked ? "••••••" : "");
      setBaseUrl(s.openai_base_url || "");
      setAiModel(s.openai_model || "gpt-4o-mini");
      setVisionKey(s.vision_api_key_masked ? "••••••" : "");
      setVisionUrl(s.vision_base_url || "");
      setVisionModel(s.vision_model || "gpt-4o");
      setFolders(Array.isArray(s.scan_folders) ? s.scan_folders : []);
    }).catch(() => {});
  }, [status]);

  const saveAI = useCallback(async () => {
    const data: Record<string, string> = {
      search_mode: searchMode, openai_base_url: baseUrl, openai_model: aiModel,
      vision_base_url: visionUrl, vision_model: visionModel,
    };
    if (apiKey && apiKey !== "••••••") data.openai_api_key = apiKey;
    if (visionKey && visionKey !== "••••••") data.vision_api_key = visionKey;
    await api.updateSettings(data);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [searchMode, apiKey, baseUrl, aiModel, visionKey, visionUrl, visionModel]);

  const addFolder = useCallback(async () => {
    const folder = await open({ directory: true, multiple: false });
    if (!folder || folders.includes(folder as string)) return;
    const next = [...folders, folder as string];
    setFolders(next);
    await api.updateSettings({ scan_folders: next } as any);
    await api.scanFolder(folder as string);
    queryClient.invalidateQueries({ queryKey: ["images"] });
  }, [folders, queryClient]);

  const removeFolder = useCallback(async (f: string) => {
    await api.removeFolder(f);
    setFolders((prev) => prev.filter((x) => x !== f));
    setRemovingFolder(null);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const pill = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg border transition-colors ${
      active ? "bg-blue-600 border-blue-600 text-white"
        : isDark ? "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
          : "border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-400"
    }`;
  const inputClass = `w-full rounded-lg px-3 py-1.5 text-sm border ${isDark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-300"}`;
  const sectionClass = `rounded-xl p-5 ${isDark ? "bg-neutral-800/40" : "bg-white border border-neutral-200"}`;
  const headClass = `text-sm font-semibold mb-3 ${isDark ? "text-neutral-200" : "text-neutral-800"}`;
  const descClass = `text-xs mb-3 ${isDark ? "text-neutral-500" : "text-neutral-400"}`;
  const subClass = `text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`;

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("settings")}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── Appearance ── */}
        <div className={sectionClass}>
          <h3 className={headClass}>{t("theme")} / {t("language")}</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className={descClass}>{t("theme")}</p>
              <div className="flex gap-2">
                {themeOptions.map((opt, i) => (
                  <button key={opt} onClick={() => setTheme(opt)} className={pill(themeSetting === opt)}>{t(themeKeys[i])}</button>
                ))}
              </div>
            </div>
            <div>
              <p className={descClass}>{t("language")}</p>
              <div className="flex gap-2">
                <button onClick={() => setLocale("en")} className={pill(locale === "en")}>English</button>
                <button onClick={() => setLocale("zh")} className={pill(locale === "zh")}>中文</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Folders ── */}
        <div className={sectionClass}>
          <h3 className={headClass}>{t("scanFolders")}</h3>
          <p className={descClass}>{t("scanFoldersDesc")}</p>
          {folders.length > 0 && (
            <div className="space-y-1 mb-3">
              {folders.map((f) => (
                <div key={f} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isDark ? "bg-neutral-700/40" : "bg-neutral-50"}`}>
                  <span className="text-xs">📁</span>
                  <span className={`text-sm flex-1 truncate ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>{f}</span>
                  <button onClick={() => setRemovingFolder(f)}
                    className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "text-neutral-500 hover:text-red-400 hover:bg-neutral-700" : "text-neutral-400 hover:text-red-500 hover:bg-neutral-100"}`}
                  >{t("remove")}</button>
                </div>
              ))}
            </div>
          )}
          {folders.length === 0 && <p className={`${descClass} mb-3 italic`}>{t("noFolders")}</p>}
          <button onClick={addFolder} className={pill(false)}>+ {t("addFolder")}</button>
        </div>

        {/* ── AI: Search Parsing ── */}
        <div className={sectionClass}>
          <h3 className={headClass}>{t("searchParsing")}</h3>
          <p className={descClass}>{t("searchParsingDesc")}</p>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setSearchMode("local")} className={pill(searchMode === "local")}>{t("searchLocal")}</button>
            <button onClick={() => setSearchMode("cloud")} className={pill(searchMode === "cloud")}>{t("searchCloud")}</button>
          </div>
          {searchMode === "cloud" && (
            <div className="space-y-2 mb-3">
              <input type="password" value={apiKey === "••••••" ? "" : apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKey === "••••••" ? t("apiKeySet") : "API Key"} className={inputClass} />
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t("baseUrlPlaceholder")} className={inputClass} />
              <input type="text" value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                placeholder="Model (gpt-4o-mini)" className={inputClass} />
            </div>
          )}

          <h3 className={`${headClass} mt-4 pt-3 border-t ${isDark ? "border-neutral-700" : "border-neutral-200"}`}>{t("visionSettings")}</h3>
          <p className={descClass}>{t("visionSettingsDesc")} {t("visionFallback")}</p>
          <div className="space-y-2 mb-3">
            <input type="password" value={visionKey === "••••••" ? "" : visionKey} onChange={(e) => setVisionKey(e.target.value)}
              placeholder={visionKey === "••••••" ? t("apiKeySet") : "API Key"} className={inputClass} />
            <input type="text" value={visionUrl} onChange={(e) => setVisionUrl(e.target.value)}
              placeholder={t("baseUrlPlaceholder")} className={inputClass} />
            <input type="text" value={visionModel} onChange={(e) => setVisionModel(e.target.value)}
              placeholder="Model (gpt-4o)" className={inputClass} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveAI} className={pill(false)}>{t("saveSettings")}</button>
            {settingsSaved && <span className="text-xs text-green-500">✓ {t("saved")}</span>}
          </div>
        </div>

        {/* ── Maintenance ── */}
        <div className={sectionClass}>
          <h3 className={headClass}>{t("maintenance")}</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button disabled={refreshing} onClick={async () => {
                setRefreshing(true); setRefreshResult(null);
                try {
                  const res = await api.refreshMetadata();
                  setRefreshResult(`${res.total} images, ${res.updated_gps} GPS`);
                  queryClient.invalidateQueries();
                } catch { setRefreshResult("Error"); }
                setRefreshing(false);
              }} className={pill(false)}>
                {refreshing ? t("refreshing") : t("refreshMetadata")}
              </button>
              {refreshResult && <span className={`text-xs ${subClass}`}>{refreshResult}</span>}
            </div>
            <p className={descClass}>{t("refreshMetadataDesc")}</p>

            <div className={`pt-3 border-t ${isDark ? "border-neutral-700" : "border-neutral-200"}`}>
              {!showResetConfirm ? (
                <button onClick={() => setShowResetConfirm(true)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-red-600/50 text-red-500 hover:bg-red-600 hover:text-white transition-colors">
                  {t("resetLibrary")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={async () => { await api.resetLibrary(); queryClient.invalidateQueries(); setShowResetConfirm(false); }}
                    className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">{t("confirmReset")}</button>
                  <button onClick={() => setShowResetConfirm(false)} className={pill(false)}>{t("cancel")}</button>
                </div>
              )}
              <p className={`${descClass} mt-2`}>{t("resetLibraryDesc")}</p>
            </div>
          </div>
        </div>

        {/* ── System Info ── */}
        <div className={sectionClass}>
          <h3 className={headClass}>{t("backendInfo")}</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className={subClass}>{t("backendStatus")}</span>
              <span className={status === "ready" ? "text-green-500" : status === "error" ? "text-red-500" : "text-yellow-500"}>
                {status === "ready" ? t("backendConnected") : status === "error" ? t("connectionError") : t("connecting")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={subClass}>{t("backendPort")}</span>
              <span className={subClass}>{port ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className={subClass}>{t("modelsStatusLabel")}</span>
              <span className={modelsStatus === "ready" ? "text-green-500" : modelsStatus === "loading" ? "text-yellow-500" : subClass}>
                {modelsStatus === "ready" ? t("modelsReady") : modelsStatus === "loading" ? t("loadingModels") : t("modelsNotLoaded")}
              </span>
            </div>
          </div>
          <p className={`${descClass} mt-3`}>DINO Gallery v0.1.0 — {t("aboutDesc")}</p>
        </div>
      </div>

      {/* Remove folder confirmation */}
      {removingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRemovingFolder(null)}>
          <div className={`rounded-xl p-6 max-w-sm mx-4 space-y-4 ${isDark ? "bg-neutral-800" : "bg-white shadow-xl"}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t("removeFolderTitle")}</h3>
            <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>{t("removeFolderDesc")}</p>
            <p className={`text-xs font-mono truncate ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>{removingFolder}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRemovingFolder(null)} className={pill(false)}>{t("cancel")}</button>
              <button onClick={() => removeFolder(removingFolder)}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">{t("confirmRemoveFolder")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
