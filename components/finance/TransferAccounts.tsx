import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { Account } from '@/features/accounts/api';
import { AccountAvatar, AccountPicker } from './AccountPicker';

const ROW_HEIGHT = 64;

// Tuval Transfer: Gönderen ve Alan tek yüzeyde iki satır, sağda güncel bakiye; iki satırın
// birleştiği yerde yönü değiştiren daire düğme.
export function TransferAccounts({
  sourceAccounts,
  targetAccounts,
  fromId,
  toId,
  onFromChange,
  onToChange,
  onSwap,
  canSwap,
  balances,
}: {
  sourceAccounts: Account[];
  targetAccounts: Account[];
  fromId: string | null;
  toId: string | null;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
  onSwap: () => void;
  canSwap: boolean;
  /** Hesap kimliği → hesabın kendi para biriminde bakiye (kuruş). */
  balances: Map<string, number>;
}) {
  const theme = useTheme();

  return (
    <View>
      <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, overflow: 'hidden' }}>
        <AccountPicker
          accounts={sourceAccounts}
          selectedId={fromId}
          onSelect={onFromChange}
          title="Gönderen hesap seç"
          renderTrigger={(selected, open) => (
            <TransferRow label="Gönderen" placeholder="Gönderen hesap seçin" account={selected} balances={balances} onPress={open} />
          )}
        />
        <View style={{ height: 1, marginLeft: 62, backgroundColor: theme.colors.separator }} />
        <AccountPicker
          accounts={targetAccounts}
          selectedId={toId}
          onSelect={onToChange}
          title="Hedef hesap seç"
          renderTrigger={(selected, open) => (
            <TransferRow label="Alan" placeholder="Hedef hesap seçin" account={selected} balances={balances} onPress={open} />
          )}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Yönü değiştir"
        disabled={!canSwap}
        onPress={onSwap}
        style={{
          position: 'absolute',
          right: 110,
          top: ROW_HEIGHT - 18,
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.colors.separator,
          opacity: canSwap ? 1 : 0.45,
        }}
      >
        <Ionicons name="swap-vertical" size={18} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function TransferRow({
  label,
  placeholder,
  account,
  balances,
  onPress,
}: {
  label: string;
  placeholder: string;
  account: Account | null;
  balances: Map<string, number>;
  onPress: () => void;
}) {
  const theme = useTheme();
  const balance = account ? balances.get(account.id) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${account ? account.name : placeholder}`}
      onPress={onPress}
      style={{
        minHeight: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 10,
      }}
    >
      {account ? (
        <AccountAvatar account={account} />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="wallet-outline" size={18} color={theme.colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text numberOfLines={1} style={{ color: account ? theme.colors.textPrimary : theme.colors.mutedControl }}>
          {account ? account.name : placeholder}
        </Text>
      </View>
      {account && balance !== undefined ? (
        <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
          {formatMinorAmount(balance, account.currency_code)}
        </Text>
      ) : (
        <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
      )}
    </Pressable>
  );
}
