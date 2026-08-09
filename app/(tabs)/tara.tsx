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
import { withAlpha } from '@/theme/colors';
import { Button, Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import {
  QuotaExceededError,
  findDuplicateDocument,
  getDocument,
  startProcessing,
  uploadAndCreateDocument,
} from '@/features/documents/api';
import { currentPeriodMonth, getCurrentOcrUsage } from '@/features/subscriptions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useMyWorkspaceRole } from '@/features/workspaces/useMyWorkspaceRole';
import { queryKeys } from '@/services/queryKeys';
import { hashArrayBuffer } from '@/utils/hash';
import { RETAIN_ORIGINAL_DEFAULT_KEY } from '@/utils/storageKeys';

// docs/07-guvenlik-gizlilik.md §11.2 — belge görüntüsü buluta gönderilmeden önce
// kullanıcıdan açık onay alınır (App Store gizlilik gereksinimi).
const OCR_CONSENT_KEY = 'vademde-ocr-consent-granted';
const OCR_CONSENT_TEXT =
  'Belgenizdeki tarih, tutar ve ödeme bilgilerini çıkarmak için belge görüntüsü güvenli bağlantı üzerinden akıllı belge analiz hizmetine gönderilecektir. Belge, siz onaylamadan finansal kayda dönüştürülmez.';

interface PendingAsset {
  uri: string;
  fileName: string;
  mimeType: string;
}

const STATUS_PROGRESS: Record<string, number> = {
  uploaded: 25,
  processing: 65,
  ready_for_review: 100,
  failed: 100,
};

const STEP_LABELS: Record<string, string> = {
  uploaded: 'Taranıyor',
  processing: 'Taranıyor',
  ready_for_review: 'Tamamlandı',
  failed: 'İşlem başarısız',
};

const FRAME_WIDTH = 280;
const FRAME_HEIGHT = 340;
const CORNER = 28;

// Hero'daki kamera düğmesinin eşmerkezli halkaları (dıştan içe).
const HERO_GLOW_OUTER = 224;
const HERO_GLOW_INNER = 176;
const HERO_BUTTON = 128;

const SCAN_INFO_TEXT =
  'Belgeyi kamerayla çekin, galeriden ya da dosyalardan seçin. Vademde belgedeki tutar, vade ve taraf bilgilerini okur; ' +
  'sonuç her zaman onay ekranında karşınıza gelir ve siz onaylamadan finansal kayda dönüşmez. ' +
  'Okuma başarısız olursa belge kaybolmaz, manuel girişe geçebilirsiniz.';

export default function TaraScreen() {
  const theme = useTheme();
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
    }, [documentQuery.data?.status, documentId, incomingAccountId, incomingDocumentType, incomingExpectedDueDate])
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
      setDocumentId(document.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.document(activeWorkspaceId, document.id) });
      await startProcessing(document.id);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        reset();
        showQuotaExceededAlert();
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
  function showQuotaExceededAlert() {
    Alert.alert('Aylık OCR kotanız doldu', 'Belgeyi manuel olarak girebilir veya planınızı yükseltebilirsiniz.', [
      { text: 'Manuel Giriş', onPress: () => router.push('/transactions/new') },
      { text: 'Planı Yükselt', onPress: () => router.push('/paywall') },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
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
      showQuotaExceededAlert();
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
            <Text variant="pageTitle">Akıllı Tarama İzni</Text>
            <Text variant="body" color="textSecondary">
              {OCR_CONSENT_TEXT}
            </Text>
            <Pressable onPress={() => router.push('/legal/privacy-policy')}>
              <Text variant="caption" style={{ color: theme.colors.brandPrimary, textDecorationLine: 'underline' }}>
                Gizlilik Politikası ve KVKK Aydınlatma Metnini oku
              </Text>
            </Pressable>
          </Stack>
          <Stack gap="sm">
            <Button label="Kabul Et ve Akıllı Tara" onPress={handleConsentAccept} />
            <Button label="Vazgeç" variant="secondary" onPress={handleConsentDecline} />
          </Stack>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (localUri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
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
            <Stack align="center">
              <View style={styles.scanFrame}>
                {status !== 'failed' ? (
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        backgroundColor: theme.colors.brandPrimary,
                        transform: [
                          {
                            translateY: scanAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, FRAME_HEIGHT - 20],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ) : null}
                {isPdf ? (
                  <Ionicons name="document-text" size={64} color={theme.colors.textSecondary} />
                ) : null}
                <CornerBrackets color={status === 'failed' ? theme.colors.danger : theme.colors.brandPrimary} />
              </View>

              <Stack gap="sm" align="center" style={{ marginTop: theme.spacing.lg }}>
                {status === 'failed' ? (
                  <>
                    <Ionicons name="alert-circle" size={28} color={theme.colors.danger} />
                    <Text variant="body" style={{ color: '#fff' }}>
                      Belge işlenemedi.
                    </Text>
                    <Button label="Tekrar Dene" variant="secondary" onPress={reset} />
                  </>
                ) : (
                  <View style={[styles.progressPill, { backgroundColor: withAlpha('#000000', 0.55) }]}>
                    <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
                    <Text variant="body" style={{ color: '#fff', marginLeft: theme.spacing.xs }}>
                      {STEP_LABELS[status ?? 'uploaded']}... %{progress}
                    </Text>
                  </View>
                )}
                {error ? (
                  <Text variant="caption" style={{ color: theme.colors.danger }}>
                    {error}
                  </Text>
                ) : null}
              </Stack>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} edges={['top', 'left', 'right']}>
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
              <Text variant="pageTitle">Belge Tara</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tarama hakkında bilgi"
                onPress={() => Alert.alert('Belge tarama nasıl çalışır?', SCAN_INFO_TEXT)}
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
          >
            <Card elevated style={{ paddingVertical: theme.spacing.xl, alignItems: 'center' }}>
              <Stack gap="md" align="center">
                <View style={styles.heroGlowWrap}>
                  <Animated.View
                    style={[
                      styles.heroGlowOuter,
                      {
                        backgroundColor: withAlpha(theme.colors.brandPrimary, 0.1),
                        transform: [
                          { scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                        ],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.heroGlowInner,
                      {
                        backgroundColor: withAlpha(theme.colors.brandPrimary, 0.18),
                        transform: [
                          { scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
                        ],
                      },
                    ]}
                  />
                  <View style={[styles.heroButton, { backgroundColor: theme.colors.brandPrimary }]}>
                    <Ionicons name="camera-outline" size={52} color={theme.colors.brandPrimaryText} />
                  </View>
                </View>

                <Stack gap="xxs" align="center">
                  <Text variant="sectionTitle">Kameradan Tara</Text>
                  <Text variant="caption" color="textSecondary">
                    Belgeyi kamerayla çekerek tara
                  </Text>
                </Stack>

                <View
                  style={[
                    styles.heroArrow,
                    { backgroundColor: theme.colors.backgroundPrimary, borderColor: theme.colors.border },
                  ]}
                >
                  <Ionicons name="arrow-forward" size={22} color={theme.colors.brandPrimary} />
                </View>
              </Stack>
            </Card>
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
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={torch}
        onCameraReady={() => setCameraReady(true)}
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
              <CornerBrackets color={theme.colors.brandPrimary} />
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
