import { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { BottomSheet, Button, Pressable, ScrollableTabs, Stack, Text } from '@/components/primitives';
import type { Counterparty } from '@/features/counterparties/api';
import {
  REMINDER_TONES,
  ReminderChannelError,
  buildReminderMessage,
  openReminderChannel,
  shareStatementPdf,
  type ReminderChannel,
  type ReminderTone,
} from '@/features/counterparties/reminder';
import { formatMinorAmount } from '@/utils/money';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const CHANNELS: { key: ReminderChannel; readonly label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'sms', label: 'SMS', icon: 'chatbubble-outline' },
  { key: 'email', get label() { return t('finance.reminder.email'); }, icon: 'mail-outline' },
];

const OPEN_LABEL_KEYS = {
  whatsapp: 'finance.reminder.openWhatsapp',
  sms: 'finance.reminder.openSms',
  email: 'finance.reminder.openEmail',
} as const;

export interface ReminderSheetProps {
  visible: boolean;
  onClose: () => void;
  workspaceId: string;
  counterparty: Counterparty;
  /** Cari bakiye (pozitif = cari bize borçlu). */
  netMinor: number;
  dueDate: string | null;
  overdue: boolean;
}

export function ReminderSheet({ visible, onClose, workspaceId, counterparty, netMinor, dueDate, overdue }: ReminderSheetProps) {
  const theme = useTheme();
  const [tone, setTone] = useState<ReminderTone>(overdue ? 'gecikti' : 'nazik');
  const [channel, setChannel] = useState<ReminderChannel>('whatsapp');
  const [attach, setAttach] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Şablon ton/ek değişince yeniden üretilir; kullanıcı elle düzenlediyse onun metni korunur.
  const templateMessage = useMemo(
    () =>
      buildReminderMessage(tone, {
        name: counterparty.name,
        amountMinor: Math.abs(netMinor),
        dueDate,
        attachStatement: attach,
      }),
    [tone, attach, counterparty.name, netMinor, dueDate]
  );
  const message = customMessage ?? templateMessage;

  async function send() {
    setBusy(true);
    try {
      await openReminderChannel(channel, counterparty, message);
      if (attach) await shareStatementPdf(workspaceId, counterparty, netMinor);
      onClose();
    } catch (error) {
      Alert.alert(
        t('finance.reminder.sendFailedTitle'),
        error instanceof ReminderChannelError ? error.message : t('finance.reminder.sendFailedBody')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('finance.reminder.title')}>
      <Stack gap="md">
        <Text variant="caption" color="textSecondary">
          {counterparty.name}
          {dueDate ? t('finance.reminder.due', { date: localeDateFormatter({ day: 'numeric', month: 'short' }).format(new Date(dueDate)) }) : ''}
          {` · ${formatMinorAmount(Math.abs(netMinor))}`}
        </Text>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            {t('finance.reminder.tone')}
          </Text>
          <ScrollableTabs
            tabs={REMINDER_TONES}
            activeKey={tone}
            onChange={(k) => {
              setCustomMessage(null);
              setTone(k as ReminderTone);
            }}
          />
        </Stack>

        <TextInput
          value={message}
          onChangeText={setCustomMessage}
          multiline
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel={t('finance.reminder.messageA11y')}
          style={[
            theme.typography.body,
            {
              minHeight: 110,
              padding: theme.spacing.md,
              borderRadius: theme.radius.input,
              backgroundColor: theme.colors.backgroundPrimary,
              color: theme.colors.textPrimary,
              textAlignVertical: 'top',
            },
          ]}
        />

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: attach }}
          onPress={() => setAttach((v) => !v)}
          style={{ minHeight: theme.touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
        >
          <Ionicons
            name={attach ? 'checkbox' : 'square-outline'}
            size={24}
            color={attach ? theme.colors.action : theme.colors.mutedControl}
          />
          <View style={{ flex: 1 }}>
            <Text variant="cardTitle">{t('finance.reminder.attachStatement')}</Text>
            <Text variant="caption" color="textSecondary">
              {t('finance.reminder.attachStatementHint')}
            </Text>
          </View>
        </Pressable>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            {t('finance.reminder.channel')}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            {CHANNELS.map((c) => {
              const active = c.key === channel;
              return (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setChannel(c.key)}
                  style={{
                    flex: 1,
                    minHeight: theme.touchTarget.minimum + 8,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: active ? theme.colors.action : theme.colors.backgroundPrimary,
                  }}
                >
                  <Ionicons name={c.icon} size={20} color={active ? theme.colors.onAction : theme.colors.textPrimary} />
                  <Text variant="caption" style={{ color: active ? theme.colors.onAction : theme.colors.textPrimary, fontWeight: '600' }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Stack>

        <Button label={t(OPEN_LABEL_KEYS[channel])} onPress={send} loading={busy} />
        <Text variant="caption" color="textSecondary">
          {t('finance.reminder.footer')}
        </Text>
      </Stack>
    </BottomSheet>
  );
}
