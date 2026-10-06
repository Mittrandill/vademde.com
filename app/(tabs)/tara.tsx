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
import { Button, Card, Pressable, Row, Stack, Text } from '@/components/primitives';
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

// Hero'daki kamera düğmesinin eşmerkezli halkaları (dıştan içe).
const HERO_GLOW_OUTER = 224;
const HERO_GLOW_INNER = 176;
const HERO_BUTTON = 128;

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
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [torch, setTorch] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [mode, setMode] = useState<'select' | 'camera'>('select');
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
      setError(err instanceof Error ? err.message : 'Belge işlenemedi');
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
      Alert.alert('Saklanamadı', err instanceof Error ? err.message : 'Belge taslak olarak saklanamadı');
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
  const progress = STATUS_PROGRESS[status ?? 'uploaded'];

  if (pendingAsset) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        {/* Önizleme görseli + uzun izin metni + iki buton küçük ekranlara (ve büyük
            yazı tipi ayarlarına) sığmıyor, alttaki "Vazgeç" ekran dışında kalıyordu.
            flexGrow ile birlikte ScrollView: yer varsa içerik dikeyde ortalanır, yoksa
            kaydırılır — buton her koşulda erişilebilir kalır. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: theme.screenEdge.standard,
            gap: theme.spacing.lg,
          }}
        >
          {pendingAsset.mimeType !== 'application/pdf' ? (
            <Image
              source={{ uri: pendingAsset.uri }}
              style={{ width: '100%', height: 160, borderRadius: theme.radius.widget }}
              resizeMode="cover"
            />
          ) : null}
          <Stack gap="xs">
            <Text variant="pageTitle">Akıllı tarama izni</Text>
            <Text variant="body" color="textSecondary">
              {OCR_CONSENT_TEXT}
            </Text>
          </Stack>
          <Stack gap="md">
            {CONSENT_POINTS.map((point) => (
              <Row key={point.title} gap="sm" align="flex-start">
                <Ionicons name={point.icon} size={theme.iconSize.xxl} color={theme.colors.textPrimary} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">{point.title}</Text>
                  <Text variant="body" color="textSecondary">
                    {point.text}
                  </Text>
                </Stack>
              </Row>
            ))}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/legal/privacy-policy')}
              style={{ minHeight: theme.touchTarget.minimum, justifyContent: 'center' }}
            >
              <Text variant="cardTitle" style={{ fontSize: 14, textDecorationLine: 'underline' }}>
                KVKK aydınlatma metnini oku
              </Text>
            </Pressable>
          </Stack>
          <Stack gap="sm">
            <Button label="İzin ver ve tara" onPress={handleConsentAccept} />
            <Button label="Şimdilik elle gireceğim" variant="secondary" onPress={handleConsentDecline} />
          </Stack>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (localUri) {
    return (
      <View key={reflowKey} style={{ flex: 1, backgroundColor: '#000' }}>
        {isPdf ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfacePrimary }]} />
        ) : (
          <Image source={{ uri: localUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        <SafeAreaView style={{ flex: 1 }}>
          {/* Kapatma düğmesi eskiden position:absolute ile katmanın tepesine
              iliştirilmişti; kamera modundaki üst kontrol satırıyla aynı hizaya
              gelmiyor, olduğundan yukarıda duruyordu. Artık iki ekran da aynı
              akış içindeki üst satırı kullanıyor. */}
          <Row
            style={{
              justifyContent: 'flex-end',
              paddingHorizontal: theme.screenEdge.standard,
              paddingTop: theme.spacing.sm,
            }}
          >
            <Pressable onPress={reset} hitSlop={12} style={styles.iconButton}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </Row>

          {/* Yüzen TabBar bu tam ekran katmanın üstünde durduğu için içerik onun
              üstünde kalacak kadar yukarı alınır. */}
          <Stack style={{ flex: 1, justifyContent: 'center', paddingBottom: tabBarOverlap }}>
            <Stack gap="lg" style={{ paddingHorizontal: theme.screenEdge.standard }}>
              {status === 'failed' ? (
                <Stack gap="sm" align="center">
                  <Ionicons name="alert-circle" size={28} color={theme.colors.danger} />
                  <Text variant="body" style={{ color: '#fff' }}>
                    Belge işlenemedi.
                  </Text>
                  <Button label="Tekrar Dene" variant="secondary" onPress={reset} />
                  {error ? (
                    <Text variant="caption" style={{ color: theme.colors.danger }}>
                      {error}
                    </Text>
                  ) : null}
                </Stack>
              ) : (
                <View
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.heroWidget,
                    padding: theme.spacing.lg,
                    gap: theme.spacing.md,
                  }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="sectionTitle">Okunuyor</Text>
                    <Text variant="label" color="textSecondary" tabular>
                      %{progress}
                    </Text>
                  </Row>
                  {PROCESS_STEPS.map((step, index) => {
                    const activeIndex = status === 'processing' ? 1 : 0;
                    const done = status === 'ready_for_review' || index < activeIndex;
                    const active = !done && index === activeIndex;
                    return (
                      <Row key={step.title} gap="sm" align="flex-start">
                        {done ? (
                          <Ionicons name="checkmark-circle" size={theme.iconSize.xxl} color={theme.colors.receivable} />
                        ) : active ? (
                          <ActivityIndicator size="small" color={theme.colors.action} style={{ width: theme.iconSize.xxl }} />
                        ) : (
                          <Ionicons name="ellipse-outline" size={theme.iconSize.xxl} color={theme.colors.mutedControl} />
                        )}
                        <Stack gap="xxs" style={{ flex: 1 }}>
                          <Text variant="cardTitle" color={done || active ? 'textPrimary' : 'textSecondary'}>
                            {step.title}
                          </Text>
                          <Text variant="caption" color="textSecondary">
                            {step.hint}
                          </Text>
                        </Stack>
                      </Row>
                    );
                  })}
                  <Text variant="caption" color="textSecondary">
                    Sonuç hazır olduğunda kontrol ekranına geçilir; hiçbir şey sen onaylamadan kaydedilmez.
                  </Text>
                </View>
              )}
            </Stack>
          </Stack>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'select') {
    const usage = ocrUsageQuery.data;
    const quotaEmpty = usage ? usage.remaining <= 0 : false;
    const quotaAccent = quotaEmpty ? theme.colors.danger : theme.colors.brandPrimary;

    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} edges={['top', 'left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: theme.screenEdge.standard,
            // Yüzen tab bar (64pt) içeriği kapatmasın.
            paddingBottom: theme.layout.tabBarClearance,
            gap: theme.spacing.lg,
          }}
        >
          <Stack gap="sm">
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="pageTitle">Belge tara</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tarama hakkında bilgi"
                onPress={() => setHelpSheetOpen(true)}
                style={[styles.infoButton, { borderColor: theme.colors.border }]}
              >
                <Ionicons name="information" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </Row>
            <Text variant="body" color="textSecondary">
              Çek, senet veya fatura ekleyin; Vademde belgeyi okuyup vadeli kaydı sizin onayınızla oluşturur.
            </Text>
            {usage ? (
              <Row
                gap="xs"
                style={[
                  styles.quotaPill,
                  {
                    borderColor: quotaEmpty ? withAlpha(theme.colors.danger, 0.4) : theme.colors.border,
                    backgroundColor: theme.colors.surfacePrimary,
                  },
                ]}
              >
                <Ionicons name="document-text-outline" size={15} color={theme.colors.textSecondary} />
                <Text variant="caption" color="textSecondary">
                  Kalan OCR kotanız:{' '}
                  <Text variant="caption" tabular style={{ color: quotaAccent, fontWeight: '700' }}>
                    {usage.remaining}
                  </Text>
                  <Text variant="caption" color="textSecondary" tabular>
                    {' '}
                    / {usage.quota}
                  </Text>
                </Text>
              </Row>
            ) : null}
          </Stack>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kameradan tara"
            onPress={() => setMode('camera')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.heroWidget,
              backgroundColor: theme.colors.action,
            }}
          >
            <Ionicons name="camera-outline" size={40} color={theme.colors.onAction} />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="sectionTitle" style={{ color: theme.colors.onAction }}>
                Kameradan tara
              </Text>
              <Text variant="caption" style={{ color: theme.colors.onAction }}>
                Belgeyi kamerayla çekerek tara
              </Text>
            </Stack>
            <Ionicons name="arrow-forward" size={theme.iconSize.xxl} color={theme.colors.onAction} />
          </Pressable>

          <Stack gap="sm">
            <SourceRow
              icon="images-outline"
              title="Galeriden Seç"
              subtitle="Fotoğraf galerisinden bir belge seçin"
              onPress={handlePickLibrary}
            />
            <SourceRow
              icon="folder-open-outline"
              title="Dosyalardan Seç"
              subtitle="Cihazınızdaki dosyalardan belge seçin"
              onPress={handlePickDocument}
            />
          </Stack>

          {/* docs/10-abonelik-gelir-modeli.md §14.1 — kota bitse bile manuel giriş açık kalır. */}
          {quotaEmpty ? (
            <Button label="Manuel Giriş" variant="secondary" onPress={() => router.push('/transactions/new')} />
          ) : null}
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
      <ScanHelpSheet visible={helpSheetOpen} onClose={() => setHelpSheetOpen(false)} />
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        {/* İzin ekranı da izin metni ekranıyla aynı desende kaydırılabilir: büyük yazı
            tipi ayarlarında buton çifti ekran dışına taşmasın. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: theme.screenEdge.standard,
            gap: theme.spacing.xl,
          }}
        >
          <Stack gap="lg" align="center">
            <Ionicons name="camera-outline" size={40} color={theme.colors.textSecondary} />
            <Text variant="cardTitle" style={{ textAlign: 'center' }}>
              Kameraya erişim gerekiyor
            </Text>
            <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
              Çek, senet veya fatura fotoğrafını taramak için kamera izni gerekir.
            </Text>
          </Stack>
          <Stack gap="sm">
            <Button label="İzin Ver" onPress={requestPermission} />
            <Button label="Vazgeç" variant="secondary" onPress={() => setMode('select')} />
          </Stack>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
        <Stack style={{ flex: 1, justifyContent: 'space-between' }}>
          <Row
            style={{
              justifyContent: 'space-between',
              paddingHorizontal: theme.screenEdge.standard,
              paddingTop: theme.spacing.sm,
            }}
          >
            <Pressable onPress={() => setMode('select')} style={styles.iconButton}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Row gap="sm">
              <Pressable onPress={() => setTorch((t) => !t)} style={styles.iconButton}>
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} style={styles.iconButton}>
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
              </Pressable>
            </Row>
          </Row>

          <Stack align="center">
            <View style={styles.scanFrame}>
              <CornerBrackets color={theme.colors.textPrimary} />
            </View>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)', marginTop: theme.spacing.sm }}>
              Belgeyi çerçeve içine hizalayın
            </Text>
          </Stack>

          <Row
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: theme.screenEdge.standard + theme.spacing.md,
              // Deklanşörün alt yarısı yüzen TabBar'ın arkasında kalıyordu: satır
              // yalnızca insets.bottom + 24'te duruyor, TabBar ise insets.bottom + 68'e
              // kadar yükseliyor. Kontroller çubuğun tamamen üstüne alınır.
              paddingBottom: tabBarOverlap + theme.spacing.lg,
            }}
          >
            <Pressable onPress={handlePickLibrary} style={styles.iconButton}>
              <Ionicons name="images-outline" size={24} color="#fff" />
            </Pressable>

            <Pressable onPress={handleCapture} disabled={!cameraReady}>
              <View style={[styles.shutterOuter, { borderColor: theme.colors.brandPrimary }]}>
                <View style={[styles.shutterInner, { backgroundColor: theme.colors.brandPrimary }]} />
              </View>
            </Pressable>

            <Pressable onPress={handlePickDocument} style={styles.iconButton}>
              <Ionicons name="document-text-outline" size={22} color="#fff" />
            </Pressable>
          </Row>
        </Stack>
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

interface SourceRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function SourceRow({ icon, title, subtitle, onPress }: SourceRowProps) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      <Card>
        <Row gap="sm">
          <View
            style={[
              styles.sourceIcon,
              { borderRadius: theme.radius.input, backgroundColor: theme.colors.backgroundPrimary },
            ]}
          >
            <Ionicons name={icon} size={24} color={theme.colors.textSecondary} />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle">{title}</Text>
            <Text variant="caption" color="textSecondary">
              {subtitle}
            </Text>
          </Stack>
          <View style={[styles.sourceChevron, { backgroundColor: theme.colors.backgroundPrimary }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </View>
        </Row>
      </Card>
    </Pressable>
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
  scanFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 2,
    opacity: 0.85,
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroGlowWrap: {
    width: HERO_GLOW_OUTER,
    height: HERO_GLOW_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlowOuter: {
    position: 'absolute',
    width: HERO_GLOW_OUTER,
    height: HERO_GLOW_OUTER,
    borderRadius: HERO_GLOW_OUTER / 2,
  },
  heroGlowInner: {
    position: 'absolute',
    width: HERO_GLOW_INNER,
    height: HERO_GLOW_INNER,
    borderRadius: HERO_GLOW_INNER / 2,
  },
  heroButton: {
    width: HERO_BUTTON,
    height: HERO_BUTTON,
    borderRadius: HERO_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArrow: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceChevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});
