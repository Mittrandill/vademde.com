import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Group, GroupedRow, GroupedRowIcon } from "@/components/primitives";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useLanguage } from "@/i18n";
import { formatMinorAmount } from "@/utils/money";
import { listAssets, assetShareValue } from "./api";
import { assetText as ta } from "./copy";
export function AssetSummary() {
  useLanguage();
  const id = useWorkspaceStore((s) => s.activeWorkspaceId);
  const query = useQuery({
    queryKey: [id, "assets", "list"],
    queryFn: () => listAssets(id!),
    enabled: !!id,
  });
  const sums = (query.data ?? [])
    .filter((a) => !a.is_archived)
    .reduce<Record<string, number>>((totals, a) => {
      const n = assetShareValue(a);
      if (n !== null)
        totals[a.currency_code] = (totals[a.currency_code] ?? 0) + n;
      return totals;
    }, {});
  return (
    <Group>
      <GroupedRow
        leading={<GroupedRowIcon name="home" />}
        title={ta("Varlıklarım")}
        subtitle={
          query.isLoading
            ? ta("Yükleniyor…")
            : query.isError
              ? ta("Varlıklar yüklenemedi.")
              : Object.entries(sums)
                  .map(([c, n]) => formatMinorAmount(n, c))
                  .join(" · ") || ta("Taşınmazlar ve araçlar")
        }
        onPress={() => router.push("/assets")}
      />
    </Group>
  );
}
