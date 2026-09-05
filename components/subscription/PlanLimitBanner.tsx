import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Row, Stack, Text } from '@/components/primitives';
import { graceDaysLeft, type PlanEnforcementState } from '@/features/subscriptions/api';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

// docs/10-abonelik-gelir-modeli.md — ücretsiz plan tek çalışma alanı içindir. Limitin
// üzerindeki mevcut kullanıcıların verisi silinmez: önce 14 günlük lütuf süresi boyunca bu
// uyarı gösterilir, süre dolduğunda fazla alanlar salt-okunur olur (bkz. supabase/migrations/
// 20260905130000_enforce_plan_limits.sql workspace_write_allowed).
//
// Uyarı hem lütuf süresinde hem kilit sonrasında görünür; ton ve metin duruma göre değişir —
// kullanıcı kilidin ne zaman geleceğini veya neden geldiğini her zaman bilir.
export function PlanLimitBanner({
  state,
  onChoosePrimary,
}: {
  state: PlanEnforcementState | null | undefined;
  /** Verilirse "Aktif alanı seç" eylemi gösterilir (çalışma alanı listesi ekranı). */
  onChoosePrimary?: () => void;
}) {
  const theme = useTheme();

  if (!state?.overLimit) return null;

  const locked = state.locked;
  const daysLeft = graceDaysLeft(state);
  const accent = locked ? theme.colors.danger : theme.colors.brandPrimary;

  const title = locked ? 'Fazla çalışma alanları salt-okunur' : 'Çalışma alanı limitini aştınız';
  const description = locked
    ? `Ücretsiz planda tek çalışma alanı kullanılabilir. Şu an ${state.workspaceCount} alanınız var; birincil alan dışındakilere yeni kayıt eklenemiyor. Verilerinizin hiçbiri silinmedi — okumaya, dışa aktarmaya ve silmeye devam edebilirsiniz.`
    : `Ücretsiz planda ${state.workspaceLimit} çalışma alanı kullanılabilir, sizde ${state.workspaceCount} tane var. ${
        state.graceUntil
          ? `${dateFormatter.format(new Date(state.graceUntil))} tarihine kadar (${daysLeft} gün) hepsi açık kalacak; bu tarihten sonra yalnızca seçtiğiniz birincil alana kayıt eklenebilir.`
          : 'Planınızı yükseltmezseniz bir süre sonra yalnızca birincil alanınıza kayıt eklenebilir.'
      } Hiçbir veri silinmez.`;

  return (
    <Card
      style={{
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.4),
        backgroundColor: withAlpha(accent, 0.08),
      }}
    >
      <Stack gap="sm">
        <Row gap="sm" align="center">
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(accent, 0.18),
            }}
          >
            <Ionicons name={locked ? 'lock-closed' : 'alert-circle-outline'} size={18} color={accent} />
          </View>
          <Text variant="cardTitle" style={{ flex: 1 }}>
            {title}
          </Text>
        </Row>

        <Text variant="caption" color="textSecondary">
          {description}
        </Text>

        <Button label="Planları gör" onPress={() => router.push('/paywall')} />
        {onChoosePrimary ? (
          <Button label="Aktif kalacak alanı seç" variant="secondary" onPress={onChoosePrimary} />
        ) : null}
      </Stack>
    </Card>
  );
}
