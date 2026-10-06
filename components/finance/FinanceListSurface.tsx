import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pagination, Pressable, Row, Text } from '@/components/primitives';

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
}

export interface FinanceListEmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function FinanceListEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onActionPress,
}: FinanceListEmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xxl }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginBottom: theme.spacing.md,
        }}
      >
        <Ionicons name={icon} size={26} color={theme.colors.textPrimary} />
      </View>
      <Text variant="cardTitle" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={{ textAlign: 'center', marginTop: theme.spacing.xs }}>
        {message}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onActionPress}
          style={{
            minHeight: theme.touchTarget.minimum,
            marginTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: 14,
            backgroundColor: theme.colors.action,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <Ionicons name="add" size={20} color={theme.colors.onAction} />
          <Text variant="cardTitle" style={{ color: theme.colors.onAction }}>
            {actionLabel}
          </Text>
        </Pressable>
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

      <View style={{ marginTop: theme.spacing.xxs, backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, overflow: 'hidden' }}>
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
