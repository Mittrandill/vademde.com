import { Tabs } from 'expo-router';

import { TabBar } from '@/components/navigation/TabBar';
import { QuickAddSheet } from '@/components/finance/QuickAddSheet';
import { t } from '@/i18n';

export default function TabsLayout() {
  return (
    <>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: t('nav.tabs.home') }} />
        <Tabs.Screen name="hareketler" options={{ title: t('nav.tabs.transactions') }} />
        <Tabs.Screen name="tara" options={{ title: t('nav.tabs.scan') }} />
        <Tabs.Screen name="takvim" options={{ title: t('nav.tabs.calendar') }} />
        <Tabs.Screen name="daha-fazla" options={{ title: t('nav.tabs.more') }} />
      </Tabs>
      <QuickAddSheet />
    </>
  );
}
