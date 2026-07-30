import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Stack, Text } from '@/components/primitives';

export default function RaporlarScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="xs" style={{ flex: 1, padding: theme.screenEdge.standard, justifyContent: 'center' }}>
        <Text variant="pageTitle">Raporlar</Text>
        <Text variant="body" color="textSecondary">
          Grafik ve raporlar Aşama 5'te eklenecek.
        </Text>
      </Stack>
    </SafeAreaView>
  );
}
