import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Pagination, Pressable, Row, Text } from '@/components/primitives';

export interface FinanceListSortAction {
  label: string;
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export interface FinanceListSurfaceProps {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  children: ReactNode;
  footerLabel?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  sortAction?: FinanceListSortAction;
  page?: number;
  totalPages?: number;
  paginationLoading?: boolean;
  onPageChange?: (page: number) => void;
  /** true: satırlar kendi kartlarını çizer; ortak yüzey/gruplu kap kullanılmaz (ör. kredi kartı kartları). */
  plain?: boolean;
}

export interface FinanceListEmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  /** Tuval: BosDurum — birincil buton altında metin butonu ("Elle ekle"). */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export function FinanceListEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onActionPress,
  secondaryLabel,
  onSecondaryPress,
}: FinanceListEmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xxl }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
          marginBottom: theme.spacing.md,
        }}
      >
        <Ionicons name={icon} size={32} color={theme.colors.textPrimary} />
      </View>
      <Text variant="sectionTitle" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={{ textAlign: 'center', marginTop: theme.spacing.xs, maxWidth: 280 }}>
        {message}
      </Text>
      {actionLabel && onActionPress ? (
        <View style={{ width: 240, marginTop: theme.spacing.lg, gap: theme.spacing.xs }}>
          <Button label={actionLabel} onPress={onActionPress} />
          {secondaryLabel && onSecondaryPress ? (
            <Button label={secondaryLabel} variant="text" onPress={onSecondaryPress} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Arama + sıralama satırı, kartsız satırlar, sayaç/yeni kayıt ve sayfalama. Hedef liste
// ekranları yalnızca satır içeriğini sağlar; dış iskelet daima aynı kalır.
export function FinanceListSurface({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
  footerLabel,
  actionLabel,
  onActionPress,
  sortAction,
  page = 0,
  totalPages = 1,
  paginationLoading,
  onPageChange,
  plain,
}: FinanceListSurfaceProps) {
  const theme = useTheme();
  const showsFooter = !!footerLabel || (!!actionLabel && !!onActionPress);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Row gap="xs" style={{ alignItems: 'center' }}>
        <View
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.colors.fill,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="search" size={17} color={theme.colors.textSecondary} />
          <TextInput
            accessibilityLabel="Listede ara"
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            value={searchValue}
            onChangeText={onSearchChange}
            returnKeyType="search"
            autoCorrect={false}
            selectionColor={theme.colors.brandPrimary}
            style={{ flex: 1, fontSize: 17, color: theme.colors.textPrimary, padding: 0 }}
          />
        </View>
        {sortAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sortAction.accessibilityLabel}
            onPress={sortAction.onPress}
            style={{
              height: 36,
              paddingHorizontal: 12,
              borderRadius: 18,
              backgroundColor: theme.colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Ionicons name={sortAction.icon} size={16} color={theme.colors.textPrimary} />
            <Text style={{ fontSize: 15, fontWeight: '500' }}>{sortAction.label}</Text>
          </Pressable>
        ) : null}
      </Row>

      <View
        style={
          plain
            ? { marginTop: theme.spacing.xxs, gap: theme.spacing.sm }
            : { marginTop: theme.spacing.xxs, backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, overflow: 'hidden' }
        }
      >
        {children}
      </View>

      {showsFooter ? (
        <Row gap="sm" style={{ minHeight: 56, justifyContent: 'space-between' }}>
          <Text
            variant="label"
            color="textSecondary"
            tabular
            numberOfLines={1}
            style={{ flexShrink: 1, textTransform: 'none' }}
          >
            {footerLabel}
          </Text>
          {actionLabel && onActionPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              onPress={onActionPress}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
            >
              <Ionicons name="add" size={20} color={theme.colors.textPrimary} />
              <Text variant="cardTitle" style={{ fontSize: 14 }}>
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </Row>
      ) : null}

      {totalPages > 1 && onPageChange ? (
        <Pagination page={page} totalPages={totalPages} loading={paginationLoading} onChange={onPageChange} />
      ) : null}
    </View>
  );
}
