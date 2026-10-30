import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Row, Stack, Text } from '@/components/primitives';
import { useNotificationPermission } from '@/services/notificationPermission';
import { t } from '@/i18n';

const SNOOZE_KEY = 'notification-permission-banner-snoozed-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Bildirim izni kapalıysa vade hatırlatmaları ve destek cevapları telefona hiç düşmez (push token
// yalnızca izin verilince kaydedilir, bkz. services/pushToken.ts). İzin bir kez reddedildiyse iOS
// tekrar soramaz; bu durumda kart sistem ayarlarına götürür. Uygulamaya dönülünce izin yeniden
// okunur, verildiyse token hemen kaydedilir ve kart kaybolur. "Şimdi değil" 7 gün gizler.
export function NotificationPermissionBanner({ userId }: { userId: string | null | undefined }) {
  const theme = useTheme();
  const { status, openControls } = useNotificationPermission(!!userId);
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((value) => setSnoozed(!!value && Number(value) > Date.now()))
      .catch(() => setSnoozed(false));
  }, []);

  if (!userId || !status || status.granted || snoozed) return null;

  function snooze() {
    setSnoozed(true);
    AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)).catch(() => {});
  }

  const accent = theme.colors.brandPrimary;
  return (
    <Card style={{ borderWidth: 1, borderColor: withAlpha(accent, 0.4), backgroundColor: withAlpha(accent, 0.08) }}>
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
            <Ionicons name="notifications-off-outline" size={18} color={accent} />
          </View>
          <Text variant="cardTitle" style={{ flex: 1 }}>
            {t('notifications.permissionBanner.title')}
          </Text>
        </Row>
        <Text variant="caption" color="textSecondary">
          {t('notifications.permissionBanner.body')}
        </Text>
        <Row gap="sm">
          <View style={{ flex: 1 }}>
            <Button label={t('notifications.permissionBanner.enable')} size="compact" onPress={() => void openControls()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('notifications.permissionBanner.later')} size="compact" variant="secondary" onPress={snooze} />
          </View>
        </Row>
      </Stack>
    </Card>
  );
}
