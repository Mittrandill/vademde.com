import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, Group, GroupedRowIcon, Pressable, Row, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { QuotaExceededSheet, ScanHelpSheet } from '@/components/finance/ScanSheets';
import {
  QuotaExceededError,
  findDuplicateDocument,
  getDocument,
  markDocumentAsDraft,
  startProcessing,
  uploadAndCreateDocument,
} from '@/features/documents/api';
import { currentPeriodMonth, getCurrentOcrUsage } from '@/features/subscriptions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useMyWorkspaceRole } from '@/features/workspaces/useMyWorkspaceRole';
import { queryKeys } from '@/services/queryKeys';
import { hashArrayBuffer } from '@/utils/hash';
import { parseGibInvoiceQr } from '@/utils/gibQr';
import { OCR_CONSENT_KEY, OCR_CONSENT_TEXT, RETAIN_ORIGINAL_DEFAULT_KEY } from '@/utils/storageKeys';
import { friendlyErrorMessage } from '@/utils/alerts';

// docs/07-guvenlik-gizlilik.md §11.2 — belge görüntüsü buluta gönderilmeden önce
// kullanıcıdan açık onay alınır (App Store gizlilik gereksinimi).
interface PendingAsset {
  uri: string;
  fileName: string;
  mimeType: string;
}

const CONSENT_POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: 'image-outline', title: 'Ne işlenir?', text: 'Yalnızca taradığın belgenin görüntüsü.' },
  {
    icon: 'checkmark-circle-outline',
    title: 'Sonuç sende',
    text: 'Tutar, vade ve karşı taraf okunur; hiçbir şey sen onaylamadan kaydedilmez.',
  },
  {
    icon: 'create-outline',
    title: 'Her zaman alternatif var',
    text: 'İzin vermesen de tüm kayıtları elle girebilirsin.',
  },
];

// BelgeIsleniyor.html: işlem adımları. Sunucu durumu (uploaded/processing/ready_for_review)
// bu üç adıma eşlenir; aktif adımdan öncekiler tamamlanmış sayılır.
const PROCESS_STEPS: { title: string; hint: string }[] = [
  { title: 'Görüntü yüklendi', hint: 'Belge güvenle iletildi' },
  { title: 'Alanlar okunuyor', hint: 'Tutar, vade, karşı taraf' },
  { title: 'Kayıtlarla karşılaştırılıyor', hint: 'Mükerrer kayıt kontrolü' },
];

const STATUS_PROGRESS: Record<string, number> = {
  uploaded: 25,
  processing: 65,
  ready_for_review: 100,
  failed: 100,
};

const FRAME_WIDTH = 280;
const FRAME_HEIGHT = 340;
const CORNER = 28;


export default function TaraScreen() {
  const qrHandledRef = useRef(false);
  function handleBarcode({ data }: { data: string }) {
    if (qrHandledRef.current) return;
    const invoice = parseGibInvoiceQr(data);
    if (!invoice) return;
    qrHandledRef.current = true;
    router.push({
      pathname: '/obligations/new',
      params: {
        type: 'fatura',
        direction: 'payable',
        title: invoice.invoiceNo ? `Fatura ${invoice.invoiceNo}` : 'e-Fatura',
        amountMinor: String(invoice.amountMinor),
        dueDate: invoice.date,
      },
    });
    // Aynı karekod art arda tetiklenmesin; kullanıcı geri dönünce yeniden okunabilir.
    setTimeout(() => {
      qrHandledRef.current = false;
    }, 4000);
  }

  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { isViewer } = useMyWorkspaceRole();
  // Hesap detayından "X Ekstresi Ekle → Kameradan Tara" ile gelindiğinde taşınır (bkz.
  // app/accounts/[id].tsx); OCR sonucuna (review ekranına) aktarılır ki kullanıcı hangi
  // hesaba/türe taradığını tekrar seçmek zorunda kalmasın (bkz. B2/B3 notları).
  // expectedDueDate: kullanıcı ekstre tablosunda belirli bir geçmiş ayı seçtiyse o ayın
  // beklenen son ödeme tarihi — OCR hiç tarih bulamazsa yedek, buluyorsa yalnızca uyumsuzluk
  // uyarısı için kullanılır (bkz. review.tsx).
  const {
    accountId: incomingAccountId,
    documentType: incomingDocumentType,
    expectedDueDate: incomingExpectedDueDate,
  } = useLocalSearchParams<{
    accountId?: string;
    documentType?: string;
    expectedDueDate?: string;
  }>();
  // Tara bir sekme ekranı; kamera ve tarama katmanları tam ekran olsa da yüzen TabBar
  // onların üzerinde çizilir. Bu katmanlardaki kontroller çubuğun kapladığı yüksekliği
  // atlamalı — SafeAreaView zaten insets.bottom'ı eklediği için burada yalnızca
  // çubuğun kendi yüksekliği + alt boşluğu kadar pay gerekir (bkz. theme/spacing.ts).
  const tabBarOverlap = theme.layout.tabBarHeight + theme.layout.tabBarBottomGap;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const facing = 'back' as const;
  const torch = false;
  const [cameraReady, setCameraReady] = useState(false);

  const [mode, setMode] = useState<'select' | 'camera'>('camera');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentGranted, setConsentGranted] = useState<boolean | null>(null);
  const [pendingAsset, setPendingAsset] = useState<PendingAsset | null>(null);
  const [quotaSheetOpen, setQuotaSheetOpen] = useState(false);
  // Kota sheet'i açıldığında saklanabilecek belge: henüz yüklenmemiş bir dosya ya da yüklenip
  // işlenemeyen (kota 402) bir belge kaydı.
  const [draftTarget, setDraftTarget] = useState<{ asset?: PendingAsset; documentId?: string } | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [helpSheetOpen, setHelpSheetOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(OCR_CONSENT_KEY).then((value) => setConsentGranted(value === 'true'));
  }, []);

  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Seçim ekranındaki kamera halkalarının yavaş nefes alma hareketi (docs §12.20 —
  // hareket bilgilendirici ve düşük tempolu olmalı).
  useEffect(() => {
    if (mode !== 'select' || localUri) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mode, localUri, pulseAnim]);

  useEffect(() => {
    if (!localUri) return undefined;
    scanAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [localUri, scanAnim]);

  const ocrUsageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });
  const quotaRemaining = ocrUsageQuery.data?.remaining;

  const documentQuery = useQuery({
    queryKey:
      activeWorkspaceId && documentId ? queryKeys.document(activeWorkspaceId, documentId) : ['document', 'disabled'],
    queryFn: () => getDocument(documentId as string),
    enabled: !!documentId && !!activeWorkspaceId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'ready_for_review' || status === 'failed' ? false : 1200;
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (documentQuery.data?.status === 'ready_for_review' && documentId) {
        // Banka dekontu gelecekteki bir borç değil gerçekleşmiş bir ödemedir; kredi/fiş gibi
        // kendi "sonuç ekranına" gider (bkz. app/documents/[id]/receipt.tsx). Kullanıcı tür
        // seçerek geldiyse (ör. hesap detayından ekstre) o niyet bozulmaz, inceleme ekranı açılır.
        if (documentQuery.data.document_type === 'banka_dekontu' && !incomingDocumentType) {
          router.push({ pathname: '/documents/[id]/receipt', params: { id: documentId } });
          reset();
          return;
        }
        router.push({
          pathname: '/documents/[id]/review',
          params: {
            id: documentId,
            ...(incomingAccountId ? { accountId: incomingAccountId } : {}),
            ...(incomingDocumentType ? { documentType: incomingDocumentType } : {}),
            ...(incomingExpectedDueDate ? { expectedDueDate: incomingExpectedDueDate } : {}),
          },
        });
        reset();
      }
    }, [
      documentQuery.data?.status,
      documentQuery.data?.document_type,
      documentId,
      incomingAccountId,
      incomingDocumentType,
      incomingExpectedDueDate,
    ])
  );

  function reset() {
    setLocalUri(null);
    setIsPdf(false);
    setDocumentId(null);
    setError(null);
    setMode('select');
  }

  async function uploadAsset(
    uri: string,
    fileName: string,
    mimeType: string,
    contentHash?: string
  ) {
    if (!activeWorkspaceId) return;
    let createdDocumentId: string | undefined;
    try {
      const retainOriginalDefault = await AsyncStorage.getItem(RETAIN_ORIGINAL_DEFAULT_KEY);
      const document = await uploadAndCreateDocument({
        workspaceId: activeWorkspaceId,
        uri,
        fileName,
        mimeType,
        contentHash,
        retainOriginal: retainOriginalDefault === 'true',
      });
      createdDocumentId = document.id;
      setDocumentId(document.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.document(activeWorkspaceId, document.id) });
      await startProcessing(document.id);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        reset();
        showQuotaExceededAlert({ documentId: createdDocumentId });
        return;
      }
      setError(friendlyErrorMessage(err, 'Belge işlenemedi'));
    }
  }

  // docs/12-mvp-kabul-kriterleri.md — aynı belge tekrar yüklenirse kullanıcı uyarılır,
  // ama engellenmez; kullanıcı yine de devam edebilir.
  async function processAsset(uri: string, fileName: string, mimeType: string) {
    if (!activeWorkspaceId) return;
    setLocalUri(uri);
    setIsPdf(mimeType === 'application/pdf');
    setError(null);

    let contentHash: string | undefined;
    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      contentHash = hashArrayBuffer(arrayBuffer);
      // Bu bir "reddedilirse taramayı engelleme" korumasıydı, ama hiç sonuçlanmayan
      // (ne başarılı ne reddedilen) bir istek try/catch'i hiç tetiklemez — ekran
      // taramanın kendisi hiç başlamadan süresiz "%25"te asılı kalırdı. Zaman aşımı,
      // "asılı kalma"yı da "başarısız" sayıp akışı devam ettirir.
      const duplicate = await Promise.race([
        findDuplicateDocument(activeWorkspaceId, contentHash),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (duplicate) {
        Alert.alert(
          'Mükerrer belge',
          `"${duplicate.file_name}" adlı belge daha önce yüklenmiş görünüyor. Yine de devam etmek istiyor musunuz?`,
          [
            { text: 'Vazgeç', style: 'cancel', onPress: reset },
            {
              text: 'Yine de Yükle',
              onPress: () => uploadAsset(uri, fileName, mimeType, contentHash),
            },
          ]
        );
        return;
      }
    } catch {
      // Mükerrer kontrolü başarısız olsa bile taramayı engelleme; contentHash olmadan devam eder.
      contentHash = undefined;
    }

    await uploadAsset(uri, fileName, mimeType, contentHash);
  }

  // docs/10-abonelik-gelir-modeli.md §14.1 — kota bittiğinde manuel giriş açık kalır;
  // kullanıcı planını yükseltebilir.
  function showQuotaExceededAlert(target?: { asset?: PendingAsset; documentId?: string }) {
    setDraftTarget(target ?? null);
    setQuotaSheetOpen(true);
  }

  // "Belgeyi taslak olarak sakla": belge OCR'sız saklanır, kota yenilenince ana sayfadaki
  // "İşlenmeyi bekliyor" listesinden işlenir (kota ve KVKK onayı o anda kontrol edilir).
  async function saveAsDraft() {
    if (!activeWorkspaceId || !draftTarget || draftSaving) return;
    setDraftSaving(true);
    try {
      if (draftTarget.documentId) {
        await markDocumentAsDraft(draftTarget.documentId);
      } else if (draftTarget.asset) {
        const { uri, fileName, mimeType } = draftTarget.asset;
        const retainOriginalDefault = await AsyncStorage.getItem(RETAIN_ORIGINAL_DEFAULT_KEY);
        await uploadAndCreateDocument({
          workspaceId: activeWorkspaceId,
          uri,
          fileName,
          mimeType,
          retainOriginal: retainOriginalDefault === 'true',
          isDraft: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardDraftDocuments(activeWorkspaceId) });
      setQuotaSheetOpen(false);
      setDraftTarget(null);
      Alert.alert('Taslak olarak saklandı', 'Kotan yenilenince ana sayfadaki "İşlenmeyi bekliyor" listesinden işleyebilirsin.');
    } catch (err) {
      Alert.alert('Saklanamadı', friendlyErrorMessage(err, 'Belge taslak olarak saklanamadı'));
    } finally {
      setDraftSaving(false);
    }
  }

  async function requestScan(uri: string, fileName: string, mimeType: string) {
    // Görüntüleyici rolü yazma yapamaz; tarama belge oluşturur (yazma) ve OCR kotası harcar.
    // Kamera/galeri adımından sonra RLS hatasıyla karşılaşmak yerine baştan engellenir.
    if (isViewer) {
      Alert.alert(
        'Yetki yok',
        'Bu çalışma alanında yalnızca görüntüleme yetkiniz var. Belge taramak için çalışma alanı sahibinden düzenleyici rolü isteyin.'
      );
      return;
    }
    if (quotaRemaining !== undefined && quotaRemaining <= 0) {
      showQuotaExceededAlert({ asset: { uri, fileName, mimeType } });
      return;
    }
    if (consentGranted) {
      await processAsset(uri, fileName, mimeType);
      return;
    }
    setPendingAsset({ uri, fileName, mimeType });
  }

  async function handleConsentAccept() {
    await AsyncStorage.setItem(OCR_CONSENT_KEY, 'true');
    setConsentGranted(true);
    const asset = pendingAsset;
    setPendingAsset(null);
    if (asset) await processAsset(asset.uri, asset.fileName, asset.mimeType);
  }

  function handleConsentDecline() {
    setPendingAsset(null);
    setMode('select');
  }

  async function handleCapture() {
    if (!cameraRef.current || !cameraReady) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo) return;
    await requestScan(photo.uri, `belge-${Date.now()}.jpg`, 'image/jpeg');
  }

  async function handlePickLibrary() {
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryPermission.granted) {
      setError('İzin verilmedi.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await requestScan(asset.uri, asset.fileName ?? `belge-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg');
  }

  async function handlePickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await requestScan(asset.uri, asset.name, asset.mimeType ?? 'application/pdf');
  }

  const status = documentQuery.data?.status;

  if (pendingAsset) {
    // Akıllı tarama izni (KVKK): tuval diliyle — görsel, başlık, gruplu maddeler, iki düğme.
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xl }}
        >
          <ScreenHeader title="Akıllı tarama izni" left={{ icon: 'close', accessibilityLabel: 'Vazgeç', onPress: handleConsentDecline }} />
          {pendingAsset.mimeType !== 'application/pdf' ? (
            <Image
              source={{ uri: pendingAsset.uri }}
              style={{ width: '100%', height: 150, borderRadius: theme.radius.widget, marginTop: theme.spacing.md }}
              resizeMode="cover"
            />
          ) : null}
          <Text color="textSecondary" style={{ marginTop: theme.spacing.md, fontSize: 15, lineHeight: 21 }}>
            {OCR_CONSENT_TEXT}
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Group inset={62}>
              {CONSENT_POINTS.map((point) => (
                <View key={point.title} style={{ minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 12 }}>
                  <GroupedRowIcon name={point.icon} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontWeight: '600' }}>{point.title}</Text>
                    <Text variant="caption" color="textSecondary">
                      {point.text}
                    </Text>
                  </View>
                </View>
              ))}
            </Group>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/legal/privacy-policy')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', textDecorationLine: 'underline' }}>KVKK aydınlatma metnini oku</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
            <Button label="İzin ver ve tara" onPress={handleConsentAccept} />
            <Button label="Şimdilik elle gireceğim" variant="secondary" onPress={handleConsentDecline} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (localUri && status === 'failed') {
    // Tuval OcrBasarisiz: belge kaybolmaz; yeniden çek ya da elle gir (bağlayıcı kural 5).
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <View style={{ flex: 1, paddingHorizontal: theme.screenEdge.standard }}>
          <ScreenHeader title="" inline left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: reset }} />
          <View style={{ alignItems: 'center', marginTop: theme.spacing.xl }}>
            <View
              style={{
                width: 120,
                height: 156,
                borderRadius: 6,
                backgroundColor: '#FBFAF6',
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 16,
                gap: 8,
                opacity: 0.8,
              }}
            >
              <View style={{ width: 60, height: 6, borderRadius: 2, backgroundColor: '#B9B7AE' }} />
              <View style={{ width: 86, height: 4, borderRadius: 2, backgroundColor: '#D6D4CB', marginTop: 8 }} />
              <View style={{ width: 70, height: 4, borderRadius: 2, backgroundColor: '#D6D4CB' }} />
              <View style={{ width: 80, height: 10, borderRadius: 2, backgroundColor: '#9C9B93', marginTop: 8 }} />
            </View>
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56, marginTop: 24, textAlign: 'center' }}>
              Belge okunamadı
            </Text>
            <Text color="textSecondary" style={{ marginTop: 8, textAlign: 'center', fontSize: 15, lineHeight: 20, maxWidth: 300 }}>
              Belge kaybolmadı; yeniden çekebilir ya da bilgileri kendiniz girebilirsiniz.
            </Text>
          </View>
          <View style={{ marginTop: theme.spacing.xl }}>
            <Group inset={62}>
              <View style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <GroupedRowIcon name="phone-portrait" />
                <Text style={{ flex: 1, fontSize: 15 }}>Telefonu sabit tutun ve 20–30 cm yaklaşın</Text>
              </View>
              <View style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <GroupedRowIcon name="sunny" />
                <Text style={{ flex: 1, fontSize: 15 }}>Işığı yandan alın; parlama tutarı kapatabilir</Text>
              </View>
            </Group>
          </View>
          {error ? (
            <Text variant="caption" color="danger" style={{ marginTop: theme.spacing.sm }}>
              {error}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <View style={{ gap: theme.spacing.xs, paddingBottom: theme.layout.tabBarClearance }}>
            <Button label="Yeniden çek" onPress={reset} />
            <Button label="Bilgileri elle gir" variant="secondary" onPress={() => router.push('/transactions/new')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (localUri) {
    // Tuval Isleniyor: belge çizimi + "Belge okunuyor" + adım listesi.
    const activeIndex = status === 'processing' ? 1 : 0;
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <View style={{ flex: 1, paddingHorizontal: theme.screenEdge.standard }}>
          <ScreenHeader title="" inline left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: reset }} />
          <View style={{ alignItems: 'center', marginTop: theme.spacing.md }}>
            <View
              style={{
                width: 150,
                height: 196,
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: '#FBFAF6',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              {isPdf ? null : <Image source={{ uri: localUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
              <Animated.View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 2,
                  backgroundColor: '#FFB000',
                  shadowColor: '#FFB000',
                  shadowOpacity: 0.6,
                  shadowRadius: 8,
                  transform: [{ translateY: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 190] }) }],
                }}
              />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: 24 }}>Belge okunuyor</Text>
            <Text color="textSecondary" style={{ marginTop: 4, fontSize: 15 }}>
              Genellikle birkaç saniye sürer.
            </Text>
          </View>
          <View style={{ marginTop: theme.spacing.xl }}>
            <Group inset={16}>
              {PROCESS_STEPS.map((step, index) => {
                const done = status === 'ready_for_review' || index < activeIndex;
                const active = !done && index === activeIndex;
                return (
                  <View key={step.title} style={{ minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text
                      style={{ flex: 1, fontWeight: active ? '600' : '400', color: done || active ? theme.colors.textPrimary : theme.colors.mutedControl }}
                    >
                      {step.title}
                    </Text>
                    {done ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                    ) : active ? (
                      <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
                    ) : null}
                  </View>
                );
              })}
            </Group>
            <Text variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.xs, paddingHorizontal: 4 }}>
              Sonuç hazır olduğunda kontrol ekranına geçilir; hiçbir şey sen onaylamadan kaydedilmez.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, padding: theme.screenEdge.standard, paddingBottom: theme.layout.tabBarClearance }}
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
            <GroupedRowIcon name="camera" tone="brandSoft" size={80} />
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', textAlign: 'center', marginTop: theme.spacing.sm }}>
              Kameraya erişim gerekiyor
            </Text>
            <Text color="textSecondary" style={{ textAlign: 'center', maxWidth: 300 }}>
              Çek, senet veya fatura fotoğrafını taramak için kamera izni gerekir. İzin vermesen de galeriden seçebilir ya da elle girebilirsin.
            </Text>
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            <Button label="İzin ver" onPress={requestPermission} />
            <Button label="Galeriden seç" variant="secondary" onPress={handlePickLibrary} />
            <Button label="Bilgileri elle gir" variant="text" onPress={() => router.push('/transactions/new')} />
          </View>
        </ScrollView>
        <QuotaExceededSheet
          visible={quotaSheetOpen}
          onClose={() => setQuotaSheetOpen(false)}
          used={ocrUsageQuery.data ? ocrUsageQuery.data.quota - ocrUsageQuery.data.remaining : 0}
          quota={ocrUsageQuery.data?.quota ?? 0}
          onSaveDraft={draftTarget ? saveAsDraft : undefined}
          draftSaving={draftSaving}
          onUpgrade={() => {
            setQuotaSheetOpen(false);
            router.push('/paywall');
          }}
          onManual={() => {
            setQuotaSheetOpen(false);
            router.push('/transactions/new');
          }}
        />
      </SafeAreaView>
    );
  }

  // Tuval Tara: tam ekran vizör — üstte kapat / "Otomatik" / "Elle gir", altta galeri · deklanşör · dosyalar.
  return (
    <View key={reflowKey} style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={torch}
        onCameraReady={() => setCameraReady(true)}
        // e-Arşiv/e-Fatura karekodu: okunursa OCR çağrılmaz, kota düşmez; kayıt formu önceden dolar
        // ve kullanıcı onayıyla oluşur (bkz. utils/gibQr.ts).
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcode}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <Row
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingTop: theme.spacing.xs,
            }}
          >
            <Pressable accessibilityLabel="Kapat" onPress={() => router.replace('/(tabs)')} style={styles.iconButton}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tarama hakkında bilgi"
              onPress={() => setHelpSheetOpen(true)}
              style={styles.chip}
            >
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Otomatik</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/transactions/new')} style={styles.chip}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Elle gir</Text>
            </Pressable>
          </Row>

          <View style={{ alignItems: 'center' }}>
            <View style={styles.scanFrame}>
              <CornerBrackets color="#FFB000" />
            </View>
            <View style={styles.hint}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Belgeyi çerçeve içine hizalayın</Text>
            </View>
          </View>

          <View style={{ paddingBottom: tabBarOverlap + theme.spacing.lg, alignItems: 'center', gap: theme.spacing.md }}>
            <Text style={{ color: '#FFB000', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>OTOMATİK</Text>
            <Row style={{ alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 34 }}>
              <Pressable accessibilityLabel="Galeri" onPress={handlePickLibrary} style={styles.sideButtonSquare}>
                <Ionicons name="images" size={22} color="#fff" />
              </Pressable>
              <Pressable accessibilityLabel="Çek" onPress={handleCapture} disabled={!cameraReady} style={styles.shutterOuter}>
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable accessibilityLabel="Dosyalar" onPress={handlePickDocument} style={styles.sideButtonRound}>
                <Ionicons name="document-text" size={22} color="#fff" />
              </Pressable>
            </Row>
          </View>
        </View>
        <QuotaExceededSheet
          visible={quotaSheetOpen}
          onClose={() => setQuotaSheetOpen(false)}
          used={ocrUsageQuery.data ? ocrUsageQuery.data.quota - ocrUsageQuery.data.remaining : 0}
          quota={ocrUsageQuery.data?.quota ?? 0}
          onSaveDraft={draftTarget ? saveAsDraft : undefined}
          draftSaving={draftSaving}
          onUpgrade={() => {
            setQuotaSheetOpen(false);
            router.push('/paywall');
          }}
          onManual={() => {
            setQuotaSheetOpen(false);
            router.push('/transactions/new');
          }}
        />
        <ScanHelpSheet visible={helpSheetOpen} onClose={() => setHelpSheetOpen(false)} />
      </SafeAreaView>
    </View>
  );
}

function CornerBrackets({ color }: { color: string }) {
  const base = { position: 'absolute' as const, width: CORNER, height: CORNER, borderColor: color };
  return (
    <>
      <View style={[base, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 }]} />
      <View style={[base, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 }]} />
      <View
        style={[base, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 }]}
      />
      <View
        style={[
          base,
          { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha('#000000', 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: withAlpha('#000000', 0.4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: withAlpha('#000000', 0.5),
  },
  sideButtonSquare: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#3A3B3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3A3B3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#F6F5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F6F5F1',
  },
});
