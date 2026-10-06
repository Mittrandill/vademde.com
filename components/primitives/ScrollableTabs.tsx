import { ScrollView } from 'react-native';

import { useTheme } from '@/theme';
import { Pill } from './Pill';

export interface ScrollableTab {
  key: string;
  label: string;
  count?: number;
}

export interface ScrollableTabsProps {
  tabs: ScrollableTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

// Yatay kayar filtre kapsülleri (vademde.css .pill): seçili olan metin renginde dolgu alır.
export function ScrollableTabs({ tabs, activeKey, onChange }: ScrollableTabsProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}
    >
      {tabs.map((tab) => (
        <Pill
          key={tab.key}
          label={tab.count !== undefined ? `${tab.label} ${tab.count}` : tab.label}
          selected={tab.key === activeKey}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </ScrollView>
  );
}
