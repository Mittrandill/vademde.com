import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text } from '@/components/primitives';
import {
  QuotaExceededError,
  findDuplicateDocument,
  getDocument,
  startProcessing,
  uploadAndCreateDocument,
} from '@/features/documents/api';
import { currentPeriodMonth, getCurrentOcrUsage } from '@/features/subscriptions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { hashArrayBuffer } from '@/utils/hash';

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

export default function TaraScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
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
        router.push(`/documents/${documentId}/review`);
        reset();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentQuery.data?.status, documentId])
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
      const document = await uploadAndCreateDocument({
        workspaceId: activeWorkspaceId,
        uri,
        fileName,
        mimeType,
        contentHash,
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
      const duplicate = await findDuplicateDocument(activeWorkspaceId, contentHash);
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
        <Stack gap="xl" style={{ flex: 1, padding: theme.screenEdge.standard, justifyContent: 'center' }}>
          {pendingAsset.mimeType !== 'application/pdf' ? (
            <Image
              source={{ uri: pendingAsset.uri }}
              style={{ width: '100%', height: 180, borderRadius: theme.radius.widget }}
              resizeMode="cover"
            />
          ) : null}
          <Stack gap="xs">
            <Text variant="pageTitle">Akıllı Tarama İzni</Text>
            <Text variant="body" color="textSecondary">
              {OCR_CONSENT_TEXT}
            </Text>
          </Stack>
          <Button label="Kabul Et ve Akıllı Tara" onPress={handleConsentAccept} />
          <Button label="Vazgeç" variant="secondary" onPress={handleConsentDecline} />
        </Stack>
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
          <Pressable
            onPress={reset}
            hitSlop={12}
            style={[
              styles.iconButton,
              {
                position: 'absolute',
                top: theme.spacing.sm,
                right: theme.screenEdge.standard,
                zIndex: 1,
              },
            ]}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          <Stack style={{ flex: 1, justifyContent: 'center' }}>
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
                  <View style={[styles.progressPill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
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
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack gap="xl" style={{ flex: 1, padding: theme.screenEdge.standard, justifyContent: 'center' }}>
          <Stack gap="xs">
            <Text variant="pageTitle">Belge Tara</Text>
            <Text variant="body" color="textSecondary">
              Çek, senet veya fatura ekleyin; Vademde belgeyi okuyup vadeli kaydı sizin onayınızla oluşturur.
            </Text>
            {ocrUsageQuery.data ? (
              <Text variant="caption" color="textSecondary">
                Kalan OCR kotanız: {ocrUsageQuery.data.remaining}/{ocrUsageQuery.data.quota}
              </Text>
            ) : null}
          </Stack>
          <Button label="Kameradan Tara" onPress={() => setMode('camera')} />
          <Button label="Galeriden Seç" variant="secondary" onPress={handlePickLibrary} />
          <Button label="Dosyalardan Seç" variant="secondary" onPress={handlePickDocument} />
        </Stack>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack
          gap="lg"
          align="center"
          style={{ flex: 1, justifyContent: 'center', padding: theme.screenEdge.standard }}
        >
          <Ionicons name="camera-outline" size={40} color={theme.colors.textSecondary} />
          <Text variant="cardTitle" style={{ textAlign: 'center' }}>
            Kameraya erişim gerekiyor
          </Text>
          <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Çek, senet veya fatura fotoğrafını taramak için kamera izni gerekir.
          </Text>
          <Button label="İzin Ver" onPress={requestPermission} />
          <Button label="Vazgeç" variant="secondary" onPress={() => setMode('select')} />
        </Stack>
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
              paddingBottom: theme.spacing.xl,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
