// Pressable/Button'ın basılı ve devre dışı durumlarında kullandığı opaklık değerleri
// tek yerden yönetilir; sayısal değerler mevcut davranışla birebir aynıdır.
export const opacity = {
  pressed: 0.7,
  disabled: 0.5,
} as const;

// İkon boyutları için gözlemlenen kullanım aralığı (SectionHeader, Pagination,
// SearchablePicker, ActionSheet, Button) tek bir ölçekte toplanır.
export const iconSize = {
  sm: 14,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 26,
} as const;
