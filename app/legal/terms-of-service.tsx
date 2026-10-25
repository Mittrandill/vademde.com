import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Row, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SectionJumpChips } from '@/components/navigation/SectionJumpChips';
import { t, useLanguage } from '@/i18n';
import { getLegalSections } from '@/i18n/legal';

// Türkçe kaynak (i18n/locales/tr/legal.ts), www.vademde.com/kullanim-sartlari ile aynı tutulur (bkz.
// reposundaki src/routes/kullanim-sartlari.tsx). App Store Review Guideline 3.1.2 — otomatik
// yenilenen abonelik satan her ekran (bkz. app/paywall/index.tsx) Kullanım Koşulları'na
// işlevsel bir bağlantı içermek zorundadır; bu sayfa o gereksinimi karşılar. İki tarafta bir
// değişiklik yapılırsa diğerine de yansıtılmalıdır. İngilizce karşılık i18n/locales/en/legal.ts içindedir.

export default function TermsOfServiceScreen() {
  useLanguage();
  const sections = getLegalSections('terms');
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const [active, setActive] = useState(0);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader
          title={t('legal.terms.title')}
          left={{ icon: 'close', accessibilityLabel: t('common.close'), onPress: () => router.back() }}
        />
      </View>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.xs }}>
        <SectionJumpChips
          titles={sections.map((x) => x.title)}
          activeIndex={active}
          onJump={(index) => {
            setActive(index);
            scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[index] ?? 0) - 8), animated: true });
          }}
        />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Text variant="label" color="textSecondary">
          {t('legal.updated')}
        </Text>

        {sections.map((section, index) => (
          <Stack
            key={section.title}
            gap="xs"
            onLayout={(e) => {
              offsets.current[index] = e.nativeEvent.layout.y;
            }}
          >
            <Text variant="sectionTitle">{section.title}</Text>
            <Text variant="body" style={{ lineHeight: 24 }}>
              {section.body}
            </Text>
          </Stack>
        ))}

        <Row
          gap="sm"
          align="center"
          style={{ padding: theme.spacing.md, borderRadius: 18, backgroundColor: theme.colors.surfacePrimary }}
        >
          <Ionicons name="mail-outline" size={22} color={theme.colors.textPrimary} />
          <Text variant="body" style={{ flex: 1 }}>
            {t('legal.contact')}{' '}
            <Text variant="body">
              info@vademde.com
            </Text>
          </Text>
        </Row>
      </ScrollView>
    </SafeAreaView>
  );
}
