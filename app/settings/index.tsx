import { useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { AppIconPicker } from '@/components/brand/AppIconPicker';
import { Button, Card, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { useSession } from '@/features/auth/useSession';
import { getMySubscription } from '@/features/subscriptions/api';
import { getMyProfile } from '@/features/profile/api';
import {
  buildInviteLink,
  createWorkspaceInvite,
  getMyWorkspaceRole,
  listWorkspaceInvites,
  listWorkspaceMembers,
  redeemWorkspaceInvite,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  updateMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@/features/workspaces/members';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert, showSaveSuccess } from '@/utils/alerts';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const THEME_OPTIONS = [
  { key: 'system' as const, label: 'Sistem' },
  { key: 'light' as const, label: 'Açık' },
  { key: 'dark' as const, label: 'Koyu' },
];

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad.
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Sahip',
  editor: 'Düzenleyici',
  viewer: 'Görüntüleyici',
};

const INVITE_ROLE_OPTIONS = [
  { key: 'editor' as const, label: 'Düzenleyici' },
  { key: 'viewer' as const, label: 'Görüntüleyici' },
];

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Ayarlar artık uygulama tercihlerinin (görünüm) yaşadığı ve kimlik/abonelik gibi daha
// derin ekranlara (Profil, Abonelik) açılan bir hub — bu ekranların kendi içeriği artık
// burada değil, kendi ekranlarında (bkz. app/profile, app/subscription).
export default function SettingsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { session } = useSession();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const setThemePreference = useThemePreferenceStore((s) => s.setThemePreference);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
  });

  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;
  const email = session?.user?.email ?? null;
  const fullName = profileQuery.data?.full_name ?? null;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row
        align="center"
        gap="sm"
        style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="pageTitle">Ayarlar</Text>
      </Row>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Card style={{ padding: 0 }}>
          <Pressable onPress={() => router.push('/profile')}>
            <Row gap="sm" style={{ padding: theme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                }}
              >
                <Text variant="body" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
                  {initialsFrom(fullName, email)}
                </Text>
              </View>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {fullName || 'Profilini tamamla'}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </Stack>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </Row>
          </Pressable>
        </Card>

        <Card style={{ padding: 0 }}>
          <Pressable onPress={() => router.push('/subscription')}>
            <Row gap="sm" style={{ padding: theme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
                }}
              >
                <Ionicons name="sparkles-outline" size={20} color={theme.colors.brandPrimary} />
              </View>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  Abonelik
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {planLabel}
                </Text>
              </Stack>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </Row>
          </Pressable>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              GÖRÜNÜM
            </Text>
            <SegmentedControl options={THEME_OPTIONS} value={themePreference} onChange={setThemePreference} />
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              UYGULAMA İKONU
            </Text>
            <AppIconPicker />
          </Stack>
        </Card>

        {activeWorkspaceId ? (
          <WorkspaceTeamSection workspaceId={activeWorkspaceId} myUserId={session?.user?.id ?? null} />
        ) : null}

        <Card style={{ padding: 0 }}>
          <Stack gap="xxs">
            <Pressable onPress={() => router.push('/categories')}>
              <Row style={{ justifyContent: 'space-between', padding: theme.spacing.md }}>
                <Text variant="body">Kategoriler</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
            <Pressable onPress={() => router.push('/counterparties')}>
              <Row style={{ justifyContent: 'space-between', padding: theme.spacing.md }}>
                <Text variant="body">Kişi / Firmalar</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
          </Stack>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Aktif çalışma alanının ekip yönetimini (üyeler, davet oluşturma/paylaşma, kod ile katılma)
// doğrudan Ayarlar'da gösterir — app/workspace/[id]/members.tsx ve app/workspace/join.tsx'teki
// aynı mantığın (bkz. features/workspaces/members.ts) buraya gömülmüş hali. Profil ekranındaki
// "ÇALIŞMA ALANLARI" kartı (tüm workspace'ler için) ayrıca duruyor; bu bölüm yalnızca aktif
// çalışma alanına tek dokunuşla erişim için var.
function WorkspaceTeamSection({ workspaceId, myUserId }: { workspaceId: string; myUserId: string | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [joinCode, setJoinCode] = useState('');

  const roleQuery = useQuery({
    queryKey: queryKeys.myWorkspaceRole(workspaceId),
    queryFn: () => getMyWorkspaceRole(workspaceId),
  });
  const isOwner = roleQuery.data === 'owner';

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => listWorkspaceMembers(workspaceId),
  });

  const invitesQuery = useQuery({
    queryKey: queryKeys.workspaceInvites(workspaceId),
    queryFn: () => listWorkspaceInvites(workspaceId),
    enabled: isOwner,
  });

  function invalidateTeam() {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvites(workspaceId) });
  }

  function shareInvite(code: string) {
    const link = buildInviteLink(code);
    Share.share({ message: `Vademde çalışma alanıma katıl. Davet kodu: ${code}\n${link}` }).catch(() => {});
  }

  const createInviteMutation = useMutation({
    mutationFn: () => createWorkspaceInvite({ workspaceId, role: inviteRole }),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvites(workspaceId) });
      shareInvite(invite.code);
    },
    onError: (error) => showErrorAlert(error),
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeWorkspaceInvite(inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvites(workspaceId) }),
    onError: (error) => showErrorAlert(error),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: 'editor' | 'viewer' }) =>
      updateMemberRole({ workspaceId, userId: input.userId, role: input.role }),
    onSuccess: invalidateTeam,
    onError: (error) => showErrorAlert(error),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember({ workspaceId, userId }),
    onSuccess: invalidateTeam,
    onError: (error) => showErrorAlert(error),
  });

  const joinMutation = useMutation({
    mutationFn: () => redeemWorkspaceInvite(joinCode),
    onSuccess: (joinedWorkspaceId) => {
      showSaveSuccess(
        'Çalışma alanına katıldınız.',
        () => router.replace('/(tabs)'),
        () => {
          setActiveWorkspaceId(joinedWorkspaceId);
          setJoinCode('');
          queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
        }
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  function onMemberPress(member: WorkspaceMember) {
    if (!isOwner || member.role === 'owner' || member.user_id === myUserId) return;
    const name = member.full_name || member.email || 'Üye';
    Alert.alert(name, `Rol: ${ROLE_LABEL[member.role]}`, [
      member.role === 'viewer'
        ? { text: 'Düzenleyici yap', onPress: () => roleMutation.mutate({ userId: member.user_id, role: 'editor' }) }
        : { text: 'Görüntüleyici yap', onPress: () => roleMutation.mutate({ userId: member.user_id, role: 'viewer' }) },
      {
        text: 'Çalışma alanından çıkar',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Üyeyi çıkar', `${name} bu çalışma alanından çıkarılsın mı?`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Çıkar', style: 'destructive', onPress: () => removeMutation.mutate(member.user_id) },
          ]),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  function onLeave() {
    if (!myUserId) return;
    Alert.alert('Ayrıl', 'Bu çalışma alanından ayrılmak istediğinize emin misiniz? Erişiminiz kaldırılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: () => removeMutation.mutate(myUserId) },
    ]);
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text variant="caption" color="textSecondary">
          ÇALIŞMA ALANI ÜYELERİ
        </Text>
        <Card style={{ padding: 0 }}>
          <Stack gap="xxs">
            {members.map((member) => {
              const tappable = isOwner && member.role !== 'owner' && member.user_id !== myUserId;
              return (
                <Pressable key={member.user_id} onPress={() => onMemberPress(member)} disabled={!tappable}>
                  <Row gap="sm" style={{ padding: theme.spacing.md }} align="center">
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: theme.radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                      }}
                    >
                      <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
                        {initials(member.full_name, member.email)}
                      </Text>
                    </View>
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {member.full_name || member.email || 'Üye'}
                        {member.user_id === myUserId ? ' (siz)' : ''}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {member.email ?? '—'}
                      </Text>
                    </Stack>
                    <View
                      style={{
                        paddingHorizontal: theme.spacing.sm,
                        paddingVertical: 4,
                        borderRadius: theme.radius.pill,
                        backgroundColor:
                          member.role === 'owner'
                            ? withAlpha(theme.colors.brandPrimary, 0.16)
                            : theme.colors.surfaceElevated,
                      }}
                    >
                      <Text variant="caption" color={member.role === 'owner' ? 'brandPrimary' : 'textSecondary'}>
                        {ROLE_LABEL[member.role]}
                      </Text>
                    </View>
                    {tappable ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} /> : null}
                  </Row>
                </Pressable>
              );
            })}
            {members.length === 0 ? (
              <Text variant="caption" color="textSecondary" style={{ padding: theme.spacing.md }}>
                {membersQuery.isLoading ? 'Yükleniyor…' : 'Üye bulunamadı.'}
              </Text>
            ) : null}
          </Stack>
        </Card>
      </Stack>

      {isOwner ? (
        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            YENİ ÜYE DAVET ET
          </Text>
          <Card>
            <Stack gap="md">
              <SegmentedControl options={INVITE_ROLE_OPTIONS} value={inviteRole} onChange={setInviteRole} stretch />
              <Button
                label="Davet kodu oluştur ve paylaş"
                icon="person-add-outline"
                onPress={() => createInviteMutation.mutate()}
                loading={createInviteMutation.isPending}
              />
            </Stack>
          </Card>

          {invites.length > 0 ? (
            <Card style={{ padding: 0 }}>
              <Stack gap="xxs">
                {invites.map((invite) => (
                  <Row key={invite.id} gap="sm" style={{ padding: theme.spacing.md }} align="center">
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="cardTitle">{invite.code}</Text>
                      <Text variant="caption" color="textSecondary">
                        {ROLE_LABEL[invite.role as WorkspaceRole] ?? invite.role} · {invite.used_count} kullanım
                      </Text>
                    </Stack>
                    <Pressable onPress={() => shareInvite(invite.code)} hitSlop={8}>
                      <Ionicons name="share-outline" size={20} color={theme.colors.brandPrimary} />
                    </Pressable>
                    <Pressable onPress={() => revokeMutation.mutate(invite.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </Pressable>
                  </Row>
                ))}
              </Stack>
            </Card>
          ) : null}
        </Stack>
      ) : null}

      <Stack gap="sm">
        <Text variant="caption" color="textSecondary">
          ÇALIŞMA ALANINA KATIL
        </Text>
        <Card>
          <Stack gap="sm">
            <TextField
              label="DAVET KODU"
              placeholder="ÖRN: 7QK4P2ZC"
              autoCapitalize="characters"
              autoCorrect={false}
              value={joinCode}
              onChangeText={(text) => setJoinCode(text.toUpperCase())}
            />
            <Button
              label="Katıl"
              onPress={() => {
                if (!joinMutation.isPending) joinMutation.mutate();
              }}
              loading={joinMutation.isPending}
              disabled={joinCode.trim().length < 4}
            />
          </Stack>
        </Card>
      </Stack>

      {roleQuery.isSuccess && !isOwner ? (
        <Button label="Çalışma alanından ayrıl" variant="danger" onPress={onLeave} loading={removeMutation.isPending} />
      ) : null}
    </Stack>
  );
}
