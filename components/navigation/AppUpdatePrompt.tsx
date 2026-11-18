import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from 'expo-router';
import * as Updates from 'expo-updates';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import { Button, Stack, Text } from '@/components/primitives';
import { t } from '@/i18n';
import { fetchStoreRelease, installedVersion } from '@/services/appUpdate';
import { useScanActivityStore } from '@/store/scanActivityStore';
import { useVoiceDraftStore } from '@/features/voice/store';
import { useTheme } from '@/theme';
import { VademdeMark } from '@/components/brand/VademdeMark';
import { useQuickAddStore } from '@/store/quickAddStore';

const DAY = 86_400_000;
const PROMPT_KEY = 'vademde-update-prompt';
type Snooze = { version: string; shownAt: number };

export function AppUpdatePrompt({ enabled }: { enabled: boolean }) {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? <MobileUpdatePrompt enabled={enabled} /> : null;
}

function MobileUpdatePrompt({ enabled }: { enabled: boolean }) {
  const focused = useIsFocused();
  const quickAdd = useQuickAddStore(s => s.open);
  const writing = useIsMutating();
  const scanning = useScanActivityStore(s => s.active);
  const voiceDraft = useVoiceDraftStore(s => !!s.draft);
  if (!focused || !enabled || quickAdd || writing || scanning || voiceDraft) return null;
  return <AvailableUpdatePrompt />;
}

function AvailableUpdatePrompt() {
  const theme = useTheme();
  const [shownKey, setShownKey] = useState<string | null>(null);
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const { data: release } = useQuery({
    queryKey: ['store-release', Platform.OS, installedVersion],
    queryFn: fetchStoreRelease,
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
  const otaKey = isUpdatePending && downloadedUpdate
    ? 'ota-' + (downloadedUpdate.updateId ?? downloadedUpdate.createdAt.toISOString())
    : null;
  const key = release?.version ?? otaKey;
  const [snooze, setSnooze] = useState<Snooze | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PROMPT_KEY).then(raw => {
      const value = raw ? JSON.parse(raw) : null;
      if (mounted) setSnooze(typeof value?.shownAt === 'number' ? value : null);
    }).catch(() => { if (mounted) setSnooze(null); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!snooze) return;
    const timer = setTimeout(() => setSnooze(null), Math.max(0, snooze.shownAt + DAY - Date.now()));
    return () => clearTimeout(timer);
  }, [snooze]);

  useEffect(() => {
    if (!key) return;
    if (snooze === undefined || (snooze?.version === key && Date.now() < snooze.shownAt + DAY)) return;
    const timer = setTimeout(() => {
      const value = { version: key, shownAt: Date.now() };
      setShownKey(key);
      setSnooze(value);
      void AsyncStorage.setItem(PROMPT_KEY, JSON.stringify(value)).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [key, snooze]);

  if (!key || shownKey !== key) return null;

  function close() {
    if (!locked.current) setShownKey(null);
  }

  async function apply() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailed(null);
    try {
      if (release) {
        await Linking.openURL(release.url);
        setShownKey(null);
      } else if (Updates.isEnabled && isUpdatePending) {
        await Updates.reloadAsync();
      }
    } catch {
      setFailed(key);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg }}>
        <Pressable accessible={false} onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]} />
        <ScrollView
          accessibilityViewIsModal
          style={{ flexGrow: 0, width: '100%', maxWidth: 360, maxHeight: '85%',
            borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary }}
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
        >
          <View accessible={false} style={{ alignSelf: 'center' }}><VademdeMark size={64} /></View>
          <Stack gap="xs">
            <Text variant="sectionTitle" accessibilityRole="header" style={{ textAlign: 'center' }}>
              {t(release ? 'runtime.updateReady' : 'runtime.updateDownloaded')}
            </Text>
            <Text color="textSecondary" style={{ textAlign: 'center' }}>
              {release ? t('runtime.updateBody', { version: release.version }) : t('runtime.restartBody')}
            </Text>
          </Stack>
          {failed === key && <Text accessibilityRole="alert" variant="caption">{t('runtime.updateFailed')}</Text>}
          <Stack gap="xxs">
            <Button loading={busy} label={t(release ? 'runtime.updateStore' : 'runtime.restart')} onPress={apply} />
            <Button variant="text" disabled={busy} label={t('runtime.later')} onPress={close} />
          </Stack>
        </ScrollView>
      </View>
    </Modal>
  );
}
