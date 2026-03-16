import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { setBackendPort, api } from "../api/client";

type BackendStatus = "connecting" | "ready" | "error";
type ModelsStatus = "not_loaded" | "need_download" | "loading" | "downloading" | "ready" | "error";

interface BackendContextValue {
  status: BackendStatus;
  modelsStatus: ModelsStatus;
  modelsDetail: Record<string, string>;
  port: number | null;
  error: string | null;
  downloadProgress: { downloaded: number; total: number } | null;
}

const BackendContext = createContext<BackendContextValue>({
  status: "connecting",
  modelsStatus: "not_loaded",
  modelsDetail: {},
  port: null,
  error: null,
  downloadProgress: null,
});

export function useBackend() {
  return useContext(BackendContext);
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>("connecting");
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus>("not_loaded");
  const [modelsDetail, setModelsDetail] = useState<Record<string, string>>({});
  const [port, setPort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);

  const pollBackend = useCallback(async () => {
    try {
      const backendStatus = await invoke<string>("get_backend_status");
      if (backendStatus === "error") {
        setStatus("error");
        setError("Backend failed to start");
        return true;
      }

      if (backendStatus !== "ready") {
        return false;
      }

      const backendPort = await invoke<number>("get_backend_port");
      setBackendPort(backendPort);

      const health = await api.health();
      if (health.status === "ok") {
        setPort(backendPort);
        setStatus("ready");
        return true;
      }
    } catch {
      // not ready yet
    }
    return false;
  }, []);

  // Poll for backend ready
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        const done = await pollBackend();
        if (done || cancelled) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [pollBackend]);

  // Poll for models status once backend is ready
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    async function pollModels() {
      while (!cancelled) {
        try {
          const res = await api.modelsStatus();
          setModelsStatus(res.status as ModelsStatus);
          setModelsDetail(res.models || {});
          setDownloadProgress(res.download?.downloading ? { downloaded: res.download.downloaded, total: res.download.total } : null);
          if (res.status === "error") setError(res.error || "Unknown error");
          if (res.status === "ready" || res.status === "error") break;
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    pollModels();
    return () => { cancelled = true; };
  }, [status]);

  return (
    <BackendContext.Provider value={{ status, modelsStatus, modelsDetail, port, error, downloadProgress }}>
      {children}
    </BackendContext.Provider>
  );
}
