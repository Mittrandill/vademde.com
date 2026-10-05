import { useEffect, useState } from 'react';
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

const CHANNELS: { key: ReminderChannel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'sms', label: 'SMS', icon: 'chatbubble-outline' },
  { key: 'email', label: 'E-posta', icon: 'mail-outline' },
];

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
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ton/ek değişince, kullanıcı metni elle düzenlemediyse şablon yeniden yazılır.
  useEffect(() => {
    if (!visible || edited) return;
    setMessage(
      buildReminderMessage(tone, {
        name: counterparty.name,
        amountMinor: Math.abs(netMinor),
        dueDate,
        attachStatement: attach,
      })
    );
  }, [visible, tone, attach, edited, counterparty.name, netMinor, dueDate]);

  async function send() {
    setBusy(true);
    try {
      await openReminderChannel(channel, counterparty, message);
      if (attach) await shareStatementPdf(workspaceId, counterparty, netMinor);
      onClose();
    } catch (error) {
      Alert.alert(
        'Gönderilemedi',
        error instanceof ReminderChannelError ? error.message : 'Seçilen uygulama açılamadı. Başka bir kanal deneyin.'
      );
    } finally {
      setBusy(false);
    }
  }

  const channelLabel = CHANNELS.find((c) => c.key === channel)?.label ?? '';

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Hatırlatma gönder">
      <Stack gap="md">
        <Text variant="caption" color="textSecondary">
          {counterparty.name}
          {dueDate ? ` · vade ${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(dueDate))}` : ''}
          {` · ${formatMinorAmount(Math.abs(netMinor))}`}
        </Text>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            Ton
          </Text>
          <ScrollableTabs
            tabs={REMINDER_TONES}
            activeKey={tone}
            onChange={(k) => {
              setEdited(false);
              setTone(k as ReminderTone);
            }}
          />
        </Stack>

        <TextInput
          value={message}
          onChangeText={(t) => {
            setEdited(true);
            setMessage(t);
          }}
          multiline
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel="Mesaj metni"
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
            <Text variant="cardTitle">Hesap özetini ekle</Text>
            <Text variant="caption" color="textSecondary">
              PDF · son 3 hareket ve bakiye (gönderdikten sonra ayrıca paylaşılır)
            </Text>
          </View>
        </Pressable>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            Nereden gönderilsin?
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

        <Button label={`${channelLabel}'ta aç`.replace("E-posta'ta", 'E-posta uygulamasında')} onPress={send} loading={busy} />
        <Text variant="caption" color="textSecondary">
          Mesaj senin hesabından gönderilir; Vademde kimseye senin adına yazmaz.
        </Text>
      </Stack>
    </BottomSheet>
  );
}
