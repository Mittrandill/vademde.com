import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Pagination, Pressable, Row, Text, TextField } from '@/components/primitives';

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
          borderRadius: theme.radius.input,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
          marginBottom: theme.spacing.md,
        }}
      >
        <Ionicons name={icon} size={26} color={theme.colors.brandPrimary} />
      </View>
      <Text variant="cardTitle" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        variant="body"
        color="textSecondary"
        style={{ textAlign: 'center', marginTop: theme.spacing.xs }}
      >
        {message}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onActionPress}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
        >
          <Ionicons name="add" size={20} color={theme.colors.brandPrimary} />
          <Text variant="body" color="brandPrimary" style={{ fontWeight: '600' }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Arama, satırlar, sayaç/yeni kayıt ve sayfalama tek bir kesintisiz hero-radius yüzeyde.
// Hedef liste ekranları yalnızca satır içeriğini sağlar; dış iskelet daima aynı kalır.
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
    <Card
      variant="hero"
      style={{ padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}
    >
      <View style={{ padding: theme.spacing.lg }}>
        <Row gap="xs">
          <View style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
            <Ionicons
              name="search-outline"
              size={22}
              color={theme.colors.textSecondary}
              style={{ position: 'absolute', left: theme.spacing.md, zIndex: 1 }}
            />
            <TextField
              accessibilityLabel="Listede ara"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChangeText={onSearchChange}
              returnKeyType="search"
              autoCorrect={false}
              style={{ paddingLeft: theme.spacing.huge, backgroundColor: theme.colors.backgroundPrimary }}
            />
          </View>
          {sortAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sortAction.accessibilityLabel}
              onPress={sortAction.onPress}
              style={{
                minWidth: theme.buttonHeight.primary,
                height: theme.buttonHeight.primary,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.input,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: theme.spacing.xxs,
              }}
            >
              <Ionicons name={sortAction.icon} size={16} color={theme.colors.textSecondary} />
              <Text variant="caption" color="textSecondary">
                {sortAction.label}
              </Text>
            </Pressable>
          ) : null}
        </Row>
      </View>

      <Divider />
      {children}

      {showsFooter ? (
        <>
          <Divider />
          <Row
            gap="sm"
            style={{ minHeight: 68, justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg }}
          >
            <Text variant="body" color="textSecondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
              {footerLabel}
            </Text>
            {actionLabel && onActionPress ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                onPress={onActionPress}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
              >
                <Ionicons name="add" size={20} color={theme.colors.brandPrimary} />
                <Text variant="body" color="brandPrimary" style={{ fontWeight: '600' }}>
                  {actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </Row>
        </>
      ) : null}

      {totalPages > 1 && onPageChange ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
          <Pagination
            page={page}
            totalPages={totalPages}
            loading={paginationLoading}
            onChange={onPageChange}
          />
        </View>
      ) : null}
    </Card>
  );
}
