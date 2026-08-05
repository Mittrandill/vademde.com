import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row } from './Stack';
import { Text } from './Text';

export interface PaginationProps {
  /** 0 tabanlı geçerli sayfa. */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  loading?: boolean;
}

// Uygulama genelinde tek bir sayfalandırma dili: numaralı sayfa kapsülleri + uç oklar.
// 5'ten fazla sayfada uçlar ve geçerli sayfanın komşuları gösterilir, arası "···" ile
// kısaltılır — "Sonraki Sayfa Yükle" yerine her zaman öngörülebilir, tıklanabilir bir
// sayfa haritası sunar (bkz. kullanıcı geri bildirimi: özel bir sayfalandırma tasarımı).
function getPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i);

  const keep = new Set<number>([0, total - 1, current]);
  if (current > 0) keep.add(current - 1);
  if (current < total - 1) keep.add(current + 1);

  const sorted = Array.from(keep).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  let previous = -1;
  for (const p of sorted) {
    if (previous !== -1 && p - previous > 1) result.push('ellipsis');
    result.push(p);
    previous = p;
  }
  return result;
}

export function Pagination({ page, totalPages, onChange, loading }: PaginationProps) {
  const theme = useTheme();
  if (totalPages <= 1) return null;

  const pages = getPageList(page, totalPages);

  return (
    <Row gap="xs" align="center" style={{ justifyContent: 'center' }}>
      <StepButton icon="chevron-back" label="Önceki sayfa" disabled={page === 0} onPress={() => onChange(page - 1)} />

      {pages.map((p, index) =>
        p === 'ellipsis' ? (
          <Text key={`ellipsis-${index}`} variant="caption" color="textSecondary" style={{ width: 16, textAlign: 'center' }}>
            ···
          </Text>
        ) : (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={`${p + 1}. sayfa`}
            onPress={() => onChange(p)}
            style={{
              minWidth: theme.touchTarget.minimum,
              height: theme.touchTarget.minimum,
              paddingHorizontal: theme.spacing.xs,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: p === page ? theme.colors.brandPrimary : 'transparent',
              borderWidth: p === page ? 0 : 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              variant="caption"
              tabular
              style={{
                color: p === page ? theme.colors.brandPrimaryText : theme.colors.textSecondary,
                fontWeight: p === page ? '700' : '400',
              }}
            >
              {p + 1}
            </Text>
          </Pressable>
        )
      )}

      <StepButton
        icon="chevron-forward"
        label="Sonraki sayfa"
        disabled={page >= totalPages - 1}
        onPress={() => onChange(page + 1)}
      />

      {loading ? <ActivityIndicator color={theme.colors.textSecondary} style={{ marginLeft: theme.spacing.xxs }} /> : null}
    </Row>
  );
}

interface StepButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function StepButton({ icon, label, disabled, onPress }: StepButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: theme.touchTarget.minimum,
        height: theme.touchTarget.minimum,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={icon} size={theme.iconSize.md} color={theme.colors.textPrimary} />
    </Pressable>
  );
}
