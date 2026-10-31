import { FinanceListHero } from "@/components/finance/FinanceListHero";
import { FinanceFilterCard } from "@/components/finance/FinanceFilterCard";
import {
  FinanceListSurface,
  FinanceListEmptyState,
} from "@/components/finance/FinanceListSurface";
import {
  FinanceDetailTabs,
  FinanceDetailInfoCard,
} from "@/components/finance/FinanceDetailBlocks";
import { DetailScaffold } from "@/components/navigation/DetailScaffold";
import { assetIcon } from "./icons";
import { useState, type ReactNode } from "react";
import {
  Alert,
  ScrollView,
  RefreshControl,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Group,
  GroupedRow,
  GroupedRowIcon,
  FieldGroup,
  ScrollableTabs,
  ActionSheet,
  AmountField,
  Stack,
  Text,
  TextField,
  SearchablePicker,
  DateField,
} from "@/components/primitives";
import {
  ScreenHeader,
  type ScreenHeaderProps,
} from "@/components/navigation/ScreenHeader";
import { useTheme } from "@/theme";
import { useLanguage } from "@/i18n";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useMyWorkspaceRole } from "@/features/workspaces/useMyWorkspaceRole";
import { formatMinorAmount, parseAmountToMinor } from "@/utils/money";
import { useExitGuard } from "@/utils/useExitGuard";
import { localIsoDate } from "@/features/obligations/api";
import {
  ASSET_KINDS,
  ASSET_LABELS,
  listAssets,
  getAssetDetails,
  getAsset,
  saveAsset,
  archiveAsset,
  assetShareValue,
  assetActivityTotals,
  type OwnedAsset,
} from "./api";
import { assetText as ta } from "./copy";

function useAssetContext() {
  useLanguage();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { role } = useMyWorkspaceRole();
  return { workspaceId, canEdit: role === "owner" || role === "editor" };
}
function Page({
  title,
  children,
  onRefresh,
  refreshing = false,
  header,
}: {
  title: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  header?: Partial<ScreenHeaderProps>;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: 48,
          gap: theme.spacing.lg,
        }}
      >
        <ScreenHeader title={title} {...header} />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function AssetsScreen() {
  const { workspaceId, canEdit } = useAssetContext();
  const [tab, setTab] = useState("active"),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [workspaceId, "assets", "list"],
    queryFn: () => listAssets(workspaceId!),
    enabled: !!workspaceId,
  });
  const rows = query.data ?? [];
  const active = rows.filter((a) => !a.is_archived);
  const totals = active.reduce<Record<string, number>>((s, a) => {
    const value = assetShareValue(a);
    if (value !== null) s[a.currency_code] = (s[a.currency_code] ?? 0) + value;
    return s;
  }, {});
  const visible = rows.filter(
    (a) =>
      (tab === "archived" ? a.is_archived : !a.is_archived) &&
      (tab !== "vehicle" || a.kind === "vehicle") &&
      (tab !== "property" ||
        ["home", "land", "field", "commercial"].includes(a.kind)) &&
      `${a.name} ${a.plate ?? ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <Page
      title={ta("Varlıklarım")}
      header={{
        right: canEdit
          ? {
              icon: "add",
              accessibilityLabel: ta("Varlık ekle"),
              onPress: () => router.push("/assets/new"),
            }
          : null,
      }}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isLoading ? (
        <Text>{ta("Yükleniyor…")}</Text>
      ) : query.isError ? (
        <>
          <Text color="danger">{ta("Varlıklar yüklenemedi.")}</Text>
          <Button label={ta("Tekrar dene")} onPress={() => query.refetch()} />
        </>
      ) : (
        <>
          {(Object.keys(totals).length
            ? Object.entries(totals)
            : [["TRY", null]]
          ).map(([c, n], index) => (
            <FinanceListHero
              key={String(c)}
              label={ta("Tahmini toplam değer · Size ait pay")}
              description={ta(
                "Kullanıcı tahminidir. Nakit bakiyenize eklenmez.",
              )}
              amountText={
                n === null
                  ? ta("Değer belirtilmedi")
                  : formatMinorAmount(Number(n), String(c))
              }
              metrics={
                index === 0
                  ? [
                      {
                        label: ta("Taşınmazlar"),
                        value: active.filter((a) =>
                          ["home", "land", "field", "commercial"].includes(
                            a.kind,
                          ),
                        ).length,
                        caption: "",
                      },
                      {
                        label: ta("Araçlar"),
                        value: active.filter((a) => a.kind === "vehicle")
                          .length,
                        caption: "",
                      },
                      {
                        label: ta("Değer belirtilmedi"),
                        value: active.filter(
                          (a) => a.estimated_value_minor === null,
                        ).length,
                        caption: "",
                      },
                    ]
                  : []
              }
            />
          ))}
          <FinanceFilterCard
            title={ta("Varlık türü")}
            description=""
            value={tab}
            onChange={setTab}
            options={[
              ["active", "Tümü"],
              ["property", "Taşınmazlar"],
              ["vehicle", "Araçlar"],
              ["archived", "Arşiv"],
            ].map(([key, label]) => ({ key, label: ta(label) }))}
          />
          <FinanceListSurface
            searchPlaceholder={ta("Ad veya plaka ile ara")}
            searchValue={search}
            onSearchChange={setSearch}
            footerLabel={`${visible.length} / ${rows.length}`}
            actionLabel={canEdit ? ta("Varlık ekle") : undefined}
            onActionPress={
              canEdit ? () => router.push("/assets/new") : undefined
            }
          >
            <Group>
              {visible.map((asset) => {
                const value = assetShareValue(asset);
                return (
                  <GroupedRow
                    key={asset.id}
                    leading={<GroupedRowIcon name={assetIcon(asset.kind)} />}
                    title={asset.name}
                    subtitle={`${ta(ASSET_LABELS[asset.kind])}${asset.plate ? ` · ${asset.plate}` : ""}`}
                    trailing={
                      <Text
                        variant="cardTitle"
                        tabular
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{ maxWidth: "44%", textAlign: "right" }}
                      >
                        {value === null
                          ? ta("Değer belirtilmedi")
                          : formatMinorAmount(value, asset.currency_code)}
                      </Text>
                    }
                    chevron={false}
                    onPress={() =>
                      router.push({
                        pathname: "/assets/[id]",
                        params: { id: asset.id },
                      })
                    }
                  />
                );
              })}
            </Group>
            {!visible.length && (
              <FinanceListEmptyState
                icon={search ? "search" : "home"}
                title={ta(
                  search ? "Eşleşen varlık bulunamadı." : "Varlıklarım",
                )}
                message={ta(
                  "Henüz varlık yok. Ev, arsa, tarla veya aracınızı ekleyin.",
                )}
                actionLabel={canEdit && !search ? ta("Varlık ekle") : undefined}
                onActionPress={() => router.push("/assets/new")}
              />
            )}
          </FinanceListSurface>
        </>
      )}
    </Page>
  );
}
export function AssetDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { workspaceId, canEdit } = useAssetContext();
  const client = useQueryClient();
  const [tab, setTab] = useState("activity");
  const [menuOpen, setMenuOpen] = useState(false);
  const query = useQuery({
    queryKey: [workspaceId, "assets", "detail", id],
    queryFn: () => getAssetDetails(workspaceId!, id),
    enabled: !!workspaceId,
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveAsset(workspaceId!, id, !query.data!.asset.is_archived),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: [workspaceId, "assets"] }),
  });
  if (!query.data)
    return (
      <Page title={ta("Varlıklarım")}>
        <Text>{ta(query.isError ? "Varlık yüklenemedi." : "Yükleniyor…")}</Text>
        {query.isError && (
          <Button label={ta("Tekrar dene")} onPress={() => query.refetch()} />
        )}
      </Page>
    );
  const { asset, history, activity, obligations } = query.data;
  const value = assetShareValue(asset);
  const totals = assetActivityTotals(activity, new Date().getFullYear());
  const info = [
    ["Varlık türü", ta(ASSET_LABELS[asset.kind])],
    ["Sahiplik oranı", `%${asset.ownership_bps / 100}`],
    ["Değer tarihi", asset.valued_on],
    ["Konum", asset.location],
    ["Plaka", asset.plate],
    ["Marka / Model", asset.make_model],
    ["Ada / Parsel", asset.parcel],
    ["Alan (m²)", asset.area_m2],
    ["Alış tarihi", asset.purchased_on],
    [
      "Alış bedeli",
      asset.purchase_price_minor === null
        ? null
        : formatMinorAmount(asset.purchase_price_minor, asset.currency_code),
    ],
    ["Not", asset.notes],
  ]
    .filter(([, v]) => v !== null && v !== "")
    .map(([label, v]) => ({ label: ta(String(label)), value: String(v) }));
  const confirmArchive = () =>
    Alert.alert(
      ta(asset.is_archived ? "Arşivden çıkar" : "Arşivle"),
      ta(
        asset.is_archived
          ? "Varlık aktif listeye geri alınsın mı?"
          : "Varlık arşivlensin mi? Geçmiş kayıtlar korunur.",
      ),
      [
        { text: ta("Vazgeç"), style: "cancel" },
        { text: ta("Onayla"), onPress: () => archive.mutate() },
      ],
    );
  return (
    <>
      <DetailScaffold
        isLoading={false}
        header={{
          title: asset.name,
          right: canEdit
            ? {
                icon: "ellipsis-horizontal",
                accessibilityLabel: ta("Varlık işlemleri"),
                onPress: () => setMenuOpen(true),
              }
            : null,
        }}
      >
        <Stack gap="xs" style={{ alignItems: "center" }}>
          <GroupedRowIcon name={assetIcon(asset.kind)} size={56} />
          <Text variant="sectionTitle" style={{ marginTop: theme.spacing.xs }}>
            {asset.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {ta(ASSET_LABELS[asset.kind])}
            {asset.is_archived ? ` · ${ta("Arşiv")}` : ""}
          </Text>
          <Text
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{
              fontSize: 38,
              lineHeight: 44,
              fontWeight: "700",
              letterSpacing: -1,
            }}
          >
            {value === null
              ? ta("Değer belirtilmedi")
              : formatMinorAmount(value, asset.currency_code)}
          </Text>
          <Text variant="caption" color="textSecondary">
            {ta("Tahmini değer · Size ait pay")}
          </Text>
        </Stack>
        {canEdit && !asset.is_archived && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["expense", "income"] as const).map((direction) => (
              <View key={direction} style={{ flex: 1 }}>
                <Button
                  label={ta(
                    direction === "expense" ? "Gider" : "Gelir",
                  )}
                  variant="secondary"
                  size="compact"
                  icon={direction === "expense" ? "arrow-up" : "arrow-down"}
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/new",
                      params: { direction, assetId: id },
                    })
                  }
                />
              </View>
            ))}
            <View style={{ flex: 1 }}>
              <Button
                label={ta("Kredi")}
                variant="secondary"
                size="compact"
                icon="add"
                onPress={() =>
                  router.push({
                    pathname: "/obligations/new",
                    params: { type: "kredi", assetId: id },
                  })
                }
              />
            </View>
          </View>
        )}
        <FinanceDetailTabs
          options={[
            { key: "activity", label: ta("Hareketler") },
            { key: "loans", label: ta("Bağlı kayıtlar") },
            { key: "value", label: ta("Değer geçmişi") },
            { key: "info", label: ta("Bilgiler") },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "activity" && (
          <Stack gap="md">
            <FinanceDetailInfoCard
              title={ta("Bu yılın özeti")}
              rows={Object.entries(totals).flatMap(([c, n]) => [
                { label: ta("Gelir"), value: formatMinorAmount(n.income, c) },
                { label: ta("Gider"), value: formatMinorAmount(n.expense, c) },
                {
                  label: ta("Anapara ödemesi"),
                  value: formatMinorAmount(n.principal, c),
                },
              ])}
              description={
                !Object.keys(totals).length
                  ? ta("Bu yıl hareket yok.")
                  : undefined
              }
            />
            <Text variant="label" color="textSecondary">
              {ta("Hareket geçmişi")}
            </Text>
            <Group>
              {activity.map((row) => (
                <GroupedRow
                  key={row.transaction_id}
                  leading={
                    <GroupedRowIcon
                      name={
                        row.direction === "income" ? "arrow-down" : "arrow-up"
                      }
                      tone={row.direction === "income" ? "success" : "default"}
                    />
                  }
                  title={
                    row.description ||
                    ta(row.direction === "income" ? "Gelir" : "Gider")
                  }
                  subtitle={row.occurred_at.slice(0, 10)}
                  value={`${row.direction === "expense" ? "−" : "+"}${formatMinorAmount(row.amount_minor, row.currency_code)}`}
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/[id]",
                      params: { id: row.transaction_id },
                    })
                  }
                />
              ))}
            </Group>
            {!activity.length && (
              <Text color="textSecondary">
                {ta("Henüz bağlı hareket yok.")}
              </Text>
            )}
          </Stack>
        )}
        {tab === "loans" && (
          <Stack gap="md">
            <Text variant="caption" color="textSecondary">
              {ta(
                "Mevcut bir kaydı düzenleyip İlgili varlık alanından bağlayabilirsiniz.",
              )}
            </Text>
            <Group>
              {obligations.map((o) => (
                <GroupedRow
                  key={o.id}
                  leading={<GroupedRowIcon name="document-text" />}
                  title={o.title}
                  subtitle={ta("Kalan ödeme")}
                  value={formatMinorAmount(
                    o.remaining_amount_minor,
                    o.currency_code,
                  )}
                  onPress={() =>
                    router.push({
                      pathname: "/obligations/[id]",
                      params: { id: o.id },
                    })
                  }
                />
              ))}
            </Group>
            {!obligations.length && (
              <Text color="textSecondary">{ta("Henüz bağlı kayıt yok.")}</Text>
            )}
          </Stack>
        )}
        {tab === "value" && (
          <FinanceDetailInfoCard
            title={ta("Değer geçmişi")}
            rows={history.map((h) => ({
              label: `${h.valued_on ?? h.recorded_at.slice(0, 10)} · %${h.ownership_bps / 100}`,
              value:
                h.estimated_value_minor === null
                  ? ta("Değer belirtilmedi")
                  : formatMinorAmount(assetShareValue(h)!, h.currency_code),
            }))}
          />
        )}
        {tab === "info" && (
          <FinanceDetailInfoCard title={ta("Varlık bilgileri")} rows={info} />
        )}
        {archive.isError && (
          <Text color="danger">
            {ta("İşlem tamamlanamadı. Tekrar deneyin.")}
          </Text>
        )}
      </DetailScaffold>
      <ActionSheet
        visible={menuOpen}
        title={ta("Varlık işlemleri")}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            key: "edit",
            label: ta("Düzenle / Değeri güncelle"),
            icon: "create-outline",
            onPress: () =>
              router.push({ pathname: "/assets/new", params: { id } }),
          },
          {
            key: "archive",
            label: ta(asset.is_archived ? "Arşivden çıkar" : "Arşivle"),
            icon: "archive",
            danger: !asset.is_archived,
            onPress: confirmArchive,
          },
        ]}
      />
    </>
  );
}
export function AssetFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { workspaceId } = useAssetContext();
  const query = useQuery({
    queryKey: [workspaceId, "assets", "edit", id],
    queryFn: () => getAsset(workspaceId!, id!),
    enabled: !!workspaceId && !!id,
  });
  if (id && !query.data)
    return (
      <Page title={ta("Varlığı düzenle")}>
        <Text>{ta(query.isError ? "Varlık yüklenemedi." : "Yükleniyor…")}</Text>
        {query.isError && (
          <Button label={ta("Tekrar dene")} onPress={() => query.refetch()} />
        )}
      </Page>
    );
  return <AssetForm initial={query.data} />;
}
function AssetForm({ initial }: { initial?: OwnedAsset }) {
  const theme = useTheme();
  const { workspaceId, canEdit } = useAssetContext();
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { allowExit } = useExitGuard(dirty);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "home",
    currency: initial?.currency_code ?? "TRY",
    value:
      initial?.estimated_value_minor == null
        ? ""
        : String(initial.estimated_value_minor / 100),
    date: initial?.valued_on ?? localIsoDate(),
    share: String((initial?.ownership_bps ?? 10000) / 100),
    purchase:
      initial?.purchase_price_minor == null
        ? ""
        : String(initial.purchase_price_minor / 100),
    purchased: initial?.purchased_on ?? "",
    location: initial?.location ?? "",
    area: initial?.area_m2 == null ? "" : String(initial.area_m2),
    parcel: initial?.parcel ?? "",
    plate: initial?.plate ?? "",
    model: initial?.make_model ?? "",
    notes: initial?.notes ?? "",
  });
  function update(key: keyof typeof form, value: string) {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !canEdit)
        throw new Error(ta("Düzenleme yetkiniz yok."));
      const value = form.value.trim() ? parseAmountToMinor(form.value) : null,
        purchase = form.purchase.trim()
          ? parseAmountToMinor(form.purchase)
          : null;
      const share = Number(form.share.replace(",", ".")),
        area = form.area.trim() ? Number(form.area.replace(",", ".")) : null;
      if (
        (form.value.trim() && value === null) ||
        (form.purchase.trim() && purchase === null) ||
        !Number.isFinite(share) ||
        share <= 0 ||
        share > 100 ||
        (area !== null && (!Number.isFinite(area) || area <= 0))
      )
        throw new Error(ta("Tutar, alan ve sahiplik oranını kontrol edin."));
      return saveAsset(
        {
          workspace_id: workspaceId,
          name: form.name.trim(),
          kind: form.kind,
          currency_code: form.currency,
          estimated_value_minor: value,
          valued_on: value === null ? null : form.date,
          ownership_bps: Math.round(share * 100),
          purchase_price_minor: purchase,
          purchased_on: form.purchased || null,
          location: form.location.trim() || null,
          area_m2: area,
          parcel: form.parcel.trim() || null,
          plate: form.plate.trim() || null,
          make_model: form.model.trim() || null,
          notes: form.notes.trim() || null,
        },
        initial?.id,
      );
    },
    onSuccess: (asset) => {
      client.invalidateQueries({ queryKey: [workspaceId, "assets"] });
      allowExit();
      router.replace({ pathname: "/assets/[id]", params: { id: asset.id } });
    },
  });
  const field = (key: keyof typeof form, label: string, numeric = false) => (
    <TextField
      label={ta(label)}
      value={form[key]}
      editable={canEdit && !save.isPending}
      keyboardType={numeric ? "decimal-pad" : "default"}
      onChangeText={(value) => update(key, value)}
      maxLength={key === "name" ? 160 : undefined}
    />
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.screenEdge.standard,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          <ScreenHeader
            inline
            title={ta(initial ? "Varlığı düzenle" : "Varlık ekle")}
            leftLabel={{ label: ta("Vazgeç"), onPress: () => router.back() }}
            rightLabel={{
              label: ta("Kaydet"),
              bold: true,
              disabled: !canEdit || !form.name.trim() || save.isPending,
              onPress: () => save.mutate(),
            }}
          />
          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <ScrollableTabs
              tabs={ASSET_KINDS.map((k) => ({
                key: k,
                label: ta(ASSET_LABELS[k]),
              }))}
              activeKey={form.kind}
              onChange={(value) => update("kind", value)}
            />
            <FieldGroup>
              {field("name", "Varlık adı")}
              {form.kind === "vehicle" && field('plate', 'Plaka')}
              {form.kind === "vehicle" && field('model', 'Marka / Model')}
              {form.kind !== "vehicle" && field('location', 'Konum')}
              {form.kind !== "vehicle" && field('area', 'Alan (m²)', true)}
              {form.kind !== "vehicle" && field('parcel', 'Ada / Parsel')}

            </FieldGroup>
            <View style={{ gap: 10 }}>
              <Text variant="label" color="textSecondary">
                {ta("Değer bilgileri")}
              </Text>
              <View>
                <FieldGroup>
                  <AmountField
                    label={ta("Tahmini güncel değer")}
                    value={form.value}
                    onChangeText={(value) => update("value", value)}
                  />
                  <SearchablePicker
                    label={ta("Para birimi")}
                    items={["TRY", "USD", "EUR", "GBP"].map((c) => ({
                      id: c,
                      name: c,
                    }))}
                    selectedId={form.currency}
                    onSelect={(value) => update("currency", value)}
                  />
                  <DateField
                    label={ta("Değer tarihi")}
                    placeholder="YYYY-MM-DD"
                    value={form.date}
                    onChangeText={(value) => update("date", value)}
                  />
                  {field("share", "Sahiplik oranı (%)", true)}
                </FieldGroup>
                <Text
                  variant="caption"
                  color="textSecondary"
                  style={{ paddingHorizontal: 16, paddingTop: 8 }}
                >
                  {ta(
                    "Değer ve alış bedeli bilgi amaçlıdır; kasada hareket oluşturmaz.",
                  )}
                </Text>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <Text variant="label" color="textSecondary">
                {ta("Alış bilgileri")}
              </Text>
              <FieldGroup>
                <AmountField
                  label={ta("Alış bedeli")}
                  value={form.purchase}
                  onChangeText={(value) => update("purchase", value)}
                />
                <DateField
                  label={ta("Alış tarihi")}
                  placeholder="YYYY-MM-DD"
                  value={form.purchased}
                  onChangeText={(value) => update("purchased", value)}
                />
              </FieldGroup>
            </View>
            <FieldGroup>{field("notes", "Not")}</FieldGroup>
            {save.isError && (
              <Text variant="caption" color="danger">
                {save.error instanceof Error
                  ? ta(save.error.message)
                  : ta("Kayıt kaydedilemedi.")}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
