import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";

interface Props {
  jobId: number;
  onComplete: () => void;
}

export default function ImportProgress({ jobId, onComplete }: Props) {
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";

  const { data } = useQuery({
    queryKey: ["scan-status", jobId],
    queryFn: () => api.getScanStatus(jobId),
    refetchInterval: (query) => {
      if (query.state.data?.status === "completed") return false;
      return 1000;
    },
  });

  if (data?.status === "completed") {
    setTimeout(onComplete, 500);
  }

  const total = data?.total ?? 0;
  const processed = data?.processed ?? 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className={`px-6 py-3 border-b ${isDark ? "border-neutral-800 bg-neutral-900/50" : "border-neutral-200 bg-neutral-50"}`}>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className={isDark ? "text-neutral-300" : "text-neutral-700"}>
          {data?.status === "completed"
            ? t("importComplete")
            : `${t("importing")} ${processed}/${total}`}
        </span>
        <span className={isDark ? "text-neutral-500" : "text-neutral-400"}>{pct}%</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}>
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
