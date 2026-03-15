import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "../hooks/useBackend";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../hooks/useI18n";
import { api } from "../api/client";
import DuplicateGroup from "../components/DuplicateGroup";

export default function DuplicatesPage() {
  const { status } = useBackend();
  const { resolved } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["duplicates"],
    queryFn: () => api.getDuplicates(),
    enabled: status === "ready",
  });

  const resolve = useMutation({
    mutationFn: ({ keepId, deleteIds }: { keepId: number; deleteIds: number[] }) =>
      api.resolveDuplicates(keepId, deleteIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });

  const groups = data?.groups ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className={`px-6 py-4 border-b ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
        <h2 className="text-lg font-medium">{t("duplicates")}</h2>
        {groups.length > 0 && (
          <p className={`text-sm mt-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
            {groups.length} {t("groupsFound")}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{t("noDuplicates")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <DuplicateGroup key={group.id} group={group} onResolve={(keepId, deleteIds) => resolve.mutate({ keepId, deleteIds })} />
          ))
        )}
      </div>
    </div>
  );
}
