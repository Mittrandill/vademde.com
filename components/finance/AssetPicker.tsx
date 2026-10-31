import { useQuery } from "@tanstack/react-query";
import { SearchablePicker, Text, Button } from "@/components/primitives";
import { assetIcon } from "@/features/assets/icons";
import { listAssets } from "@/features/assets/api";
import { assetText as ta } from "@/features/assets/copy";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useLanguage } from "@/i18n";

export function AssetPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  useLanguage();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const query = useQuery({
    queryKey: [workspaceId, "assets", "list"],
    queryFn: () => listAssets(workspaceId!),
    enabled: !!workspaceId,
  });
  if (query.isError)
    return (
      <>
        <Text color="danger">{ta("Varlıklar yüklenemedi.")}</Text>
        <Button label={ta("Tekrar dene")} onPress={() => query.refetch()} />
      </>
    );
  return (
    <SearchablePicker
      label={ta("İlgili varlık")}
      title={ta("Varlık seç")}
      placeholder={query.isLoading ? ta("Yükleniyor…") : ta("Varlık seçilmedi")}
      items={[
        { id: "", name: ta("Bağlantıyı kaldır") },
        ...(query.data ?? []).filter((a) => !a.is_archived || a.id === value),
      ]}
      selectedId={value}
      onSelect={(id) => onChange(id || null)}
      getIcon={(item) =>
        "kind" in item ? assetIcon(String(item.kind)) : "close-circle"
      }
    />
  );
}
