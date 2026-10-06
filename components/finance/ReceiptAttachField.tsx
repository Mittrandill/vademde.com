import { Alert, Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Group, GroupedRowIcon, Pressable, Tag, Text } from '@/components/primitives';
import { openReceipt, type PendingReceipt } from '@/features/receipts/api';

interface ReceiptAttachFieldProps {
  /** Yeni seçilen (henüz yüklenmemiş) dekont. */
  value: PendingReceipt | null;
  onChange: (value: PendingReceipt | null) => void;
  /** Ödemeye zaten bağlı kayıtlı dekont (düzenleme modu). */
  existingReceiptId?: string | null;
  /** Kayıtlı dekontu ödemeden ayırmak için. */
  onRemoveExisting?: () => void;
  /** Belge arşivi (Plus) erişimi; yoksa alan kilitli görünür ve paywall'a yönlendirir. */
  allowed: boolean;
  /** Kilitli alana dokunulunca çalışır; verilmezse doğrudan paywall açılır. Modal içindeki
   * formlar önce modalı kapatıp sonra yönlendirmek için bunu verir. */
  onUpgrade?: () => void;
}

async function pickFromCamera(): Promise<PendingReceipt | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Kamera izni gerekli', 'Dekont fotoğrafı çekebilmek için ayarlardan kamera iznini açın.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `dekont-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

async function pickFromLibrary(): Promise<PendingReceipt | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Fotoğraf izni gerekli', 'Galeriden dekont seçebilmek için ayarlardan fotoğraf iznini açın.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `dekont-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

async function pickFromFiles(): Promise<PendingReceipt | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? 'application/pdf' };
}

// Ödeme formundaki "isteğe bağlı dekont" alanı: kamera, galeri ya da dosya (PDF) seçilir.
// Plus'a özeldir — planı olmayan kullanıcıya kilitli görünür ve dokununca paywall açılır.
export function ReceiptAttachField({
  value,
  onChange,
  existingReceiptId,
  onRemoveExisting,
  allowed,
  onUpgrade,
}: ReceiptAttachFieldProps) {
  const theme = useTheme();

  function choose() {
    if (!allowed) {
      if (onUpgrade) onUpgrade();
      else router.push('/paywall');
      return;
    }
    const run = async (picker: () => Promise<PendingReceipt | null>) => {
      const picked = await picker();
      if (picked) onChange(picked);
    };
    Alert.alert('Dekont ekle', 'Dekontu nasıl eklemek istersiniz?', [
      { text: 'Fotoğraf çek', onPress: () => run(pickFromCamera) },
      { text: 'Galeriden seç', onPress: () => run(pickFromLibrary) },
      { text: 'Dosyalardan seç (PDF)', onPress: () => run(pickFromFiles) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function openExisting() {
    if (!existingReceiptId) return;
    try {
      await openReceipt(existingReceiptId);
    } catch {
      Alert.alert('Dekont açılamadı', 'Dosya bulunamadı ya da bağlantı kurulamadı.');
    }
  }

  const isImage = !!value && value.mimeType.startsWith('image/');

  const rowStyle = {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  };

  // Tuval OdemeKaydet "Dekont ekle": gruplu yüzeyde tek satır (ikon + metin + ikincil ek bilgi).
  return (
    <Group inset={62}>
      {value ? (
        <View style={rowStyle}>
          {isImage ? (
            <Image source={{ uri: value.uri }} style={{ width: 34, height: 34, borderRadius: 9 }} />
          ) : (
            <GroupedRowIcon name="document-text" tone="violet" />
          )}
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {value.fileName}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dekontu kaldır" onPress={() => onChange(null)} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={theme.colors.mutedControl} />
          </Pressable>
        </View>
      ) : existingReceiptId ? (
        <View style={rowStyle}>
          <GroupedRowIcon name="attach" />
          <Text style={{ flex: 1 }}>Dekont ekli</Text>
          <Pressable accessibilityRole="button" onPress={openExisting} hitSlop={8}>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>Aç</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={choose} hitSlop={8}>
            <Text color="textSecondary" style={{ fontSize: 15 }}>
              Değiştir
            </Text>
          </Pressable>
          {onRemoveExisting ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Dekontu ödemeden ayır" onPress={onRemoveExisting} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.colors.mutedControl} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allowed ? 'Dekont ekle' : 'Dekont ekle, Plus planına özel'}
          onPress={choose}
          style={rowStyle}
        >
          <GroupedRowIcon name={allowed ? 'attach' : 'lock-closed'} />
          <Text style={{ flex: 1 }}>Dekont ekle</Text>
          {allowed ? (
            <Text color="textSecondary" style={{ fontSize: 15 }}>
              İsteğe bağlı
            </Text>
          ) : (
            <Tag tone="brand" label="Plus" />
          )}
          <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
        </Pressable>
      )}
    </Group>
  );
}
