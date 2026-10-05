import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

// docs/06 §10.6.2 — mevcut sayfa boyutu 30; bileşenler sayfa boyutunu bilmez, çağıran verir.
export const LIST_PAGE_SIZE = 30;

export interface LoadMoreProps {
  loaded: number;
  total: number;
  onPress: () => void;
  loading?: boolean;
  /** Toplamı anlatan çoğul isim (ör. "hareket"). */
  noun?: string;
}

// "Daha fazla yükle": ilerleme çubuğu + sayaç + buton (HANDOFF §3, Sayfalandirma.html).
export function LoadMore({ loaded, total, onPress, loading, noun = 'kayıt' }: LoadMoreProps) {
  const theme = useTheme();
  if (total > 0 && loaded >= total) return null;
  const ratio = total > 0 ? Math.min(1, loaded / total) : 0;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}>
      {total > 0 ? (
        <>
          <View
            style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: theme.colors.border }}
          >
            <View
              style={{
                width: `${Math.max(2, ratio * 100)}%`,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.textPrimary,
              }}
            />
          </View>
          <Text variant="label" color="textSecondary" tabular>
            {loaded} / {total} {noun}
          </Text>
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Daha fazla yükle"
        disabled={loading}
        onPress={onPress}
        style={{
          minHeight: theme.touchTarget.minimum,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.input,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfacePrimary,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.xs,
        }}
      >
        {loading ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
        <Text variant="cardTitle">Daha fazla yükle</Text>
      </Pressable>
    </View>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  const theme = useTheme();

  return (
    <View accessibilityLabel="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm + 2,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={12} borderRadius={6} />
            <Skeleton width="40%" height={10} borderRadius={5} />
          </View>
          <Skeleton width={64} height={12} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

export function ListEnd({ label }: { label: string }) {
  const theme = useTheme();
  const line = { flex: 1, height: 1, backgroundColor: theme.colors.border } as const;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <View style={line} />
      <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
        {label}
      </Text>
      <View style={line} />
    </View>
  );
}

export interface ListErrorProps {
  message?: string;
  onRetry: () => void;
}

export function ListError({ message = 'Sonraki kayıtlar yüklenemedi.', onRetry }: ListErrorProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xxs,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={theme.iconSize.xl} color={theme.colors.danger} />
      <Text variant="body" style={{ flex: 1, fontSize: 14 }}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          minHeight: theme.touchTarget.minimum,
          paddingHorizontal: theme.spacing.sm + 2,
          borderRadius: theme.radius.input - 3,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfacePrimary,
          justifyContent: 'center',
        }}
      >
        <Text variant="cardTitle" style={{ fontSize: 14 }}>
          Tekrar dene
        </Text>
      </Pressable>
    </View>
  );
}
