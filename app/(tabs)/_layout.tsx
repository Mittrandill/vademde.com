import { Tabs } from 'expo-router';

import { TabBar } from '@/components/navigation/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Ana Sayfa' }} />
      <Tabs.Screen name="hareketler" options={{ title: 'Hareketler' }} />
      <Tabs.Screen name="tara" options={{ title: 'Tara' }} />
      <Tabs.Screen name="takvim" options={{ title: 'Takvim' }} />
      <Tabs.Screen name="daha-fazla" options={{ title: 'Daha Fazla' }} />
    </Tabs>
  );
}
