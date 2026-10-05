import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Text } from './Text';

export type SourceTagKind = 'document' | 'matched' | 'suggested' | 'check';

const LABELS: Record<SourceTagKind, string> = {
  document: 'Belgeden',
  matched: 'Eşleşti',
  suggested: 'Önerildi',
  check: 'Kontrol et',
};

export interface SourceTagProps {
  kind: SourceTagKind;
}

// HANDOFF §3 — OCR alan kaynağı etiketi. Doğrulanmış kaynaklar (Belgeden / Eşleşti / Önerildi)
// receivable renginde; kullanıcının kontrol etmesi gereken alan attentionMarker rengiyle ve
// kesik çizgili çerçevede. Renk tek başına anlam taşımaz: metin her durumda yazılıdır.
export function SourceTag({ kind }: SourceTagProps) {
  const theme = useTheme();
  const attention = kind === 'check';
  const color = attention ? theme.colors.attentionMarker : theme.colors.receivable;

  return (
    <View
      accessible
      accessibilityLabel={LABELS[kind]}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        height: 24,
        borderRadius: 8,
        borderWidth: attention ? 1.5 : 0,
        borderStyle: 'dashed',
        borderColor: color,
      }}
    >
      {attention ? null : <Ionicons name="checkmark" size={theme.iconSize.sm} color={color} />}
      <Text variant="label" style={{ color, fontSize: 10, lineHeight: 12 }}>
        {LABELS[kind]}
      </Text>
    </View>
  );
}
