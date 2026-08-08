import { useState } from 'react';
import { Alert, Share, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import {
  buildInviteLink,
  createWorkspaceInvite,
  getMyWorkspaceRole,
  listWorkspaceInvites,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  updateMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@/features/workspaces/members';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert } from '@/utils/alerts';

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Sahip',
  editor: 'Düzenleyici',
  viewer: 'Görüntüleyici',
};

const INVITE_ROLE_OPTIONS = [
  { key: 'editor' as const, label: 'Düzenleyici' },
  { key: 'viewer' as const, label: 'Görüntüleyici' },
];

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

export default function WorkspaceMembersScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = id as string;
  const myUserId = session?.user?.id ?? null;

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');

  const roleQuery = useQuery({
    queryKey: queryKeys.myWorkspaceRole(workspaceId),
    queryFn: () => getMyWorkspaceRole(workspaceId),
    enabled: !!workspaceId,
  });
  const isOwner = roleQuery.data === 'owner';

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => listWorkspaceMembers(workspaceId),
    enabled: !!workspaceId,
  });

  const invitesQuery = useQuery({
    queryKey: queryKeys.workspaceInvites(workspaceId),
    queryFn: () => listWorkspaceInvites(workspaceId),
    enabled: !!workspaceId && isOwner,
  });

  function invalidateTeam() {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvites(workspaceId) });
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

  function shareInvite(code: string) {
    const link = buildInviteLink(code);
    Share.share({
      message: `Vademde çalışma alanıma katıl. Davet kodu: ${code}\n${link}`,
    }).catch(() => {});
  }

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Ekip" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Text variant="caption" color="textSecondary">
          Bu çalışma alanının tüm verileri üyeler arasında canlı olarak paylaşılır. Düzenleyiciler
          kayıt ekleyip değiştirebilir; görüntüleyiciler yalnızca görür.
        </Text>

        {/* ÜYELER */}
        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            ÜYELER
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
                      {tappable ? (
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                      ) : null}
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

        {/* DAVETLER — yalnızca sahip */}
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
                          {ROLE_LABEL[(invite.role as WorkspaceRole)] ?? invite.role} · {invite.used_count} kullanım
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

        {/* Sahip olmayan üye ayrılabilir */}
        {roleQuery.isSuccess && !isOwner ? (
          <Button label="Çalışma alanından ayrıl" variant="danger" onPress={onLeave} loading={removeMutation.isPending} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
