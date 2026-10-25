import { useEffect, useState } from 'react';
import { Alert, Share, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  Button,
  Card,
  Divider,
  Pressable,
  Row,
  SegmentedControl,
  Stack,
  StatColumns,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { deleteWorkspace, listMyWorkspaces, updateWorkspaceName } from '@/features/workspaces/api';
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
import { getAllPlanLimits } from '@/features/subscriptions/api';
import { usePlanEnforcement } from '@/features/subscriptions/usePlanEnforcement';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { t } from '@/i18n';
import { localizedRecord } from '@/i18n/localized';

const ROLE_LABEL: Record<WorkspaceRole, string> = localizedRecord(['owner', 'editor', 'viewer'] as const, (role) =>
  t(`workspace.roles.${role}`)
);

const INVITE_ROLE_OPTIONS = [
  { key: 'editor' as const, get label() { return t('workspace.roles.editor'); } },
  { key: 'viewer' as const, get label() { return t('workspace.roles.viewer'); } },
];

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Web'deki /uygulama/calisma-alanlari/$id ile aynı mantık: çalışma alanı özeti (ad
// düzenleme, aktif/pasif durumu, rol), davet oluşturma (etiket + kopyala/paylaş) ve üye
// yönetimi tek ekranda birleşir — önceden Profil'de (ad düzenle/sil) ve burada (üye/davet)
// ikiye bölünmüştü.
export default function WorkspaceDetailScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = id as string;
  const myUserId = session?.user?.id ?? null;
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteLabel, setInviteLabel] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });
  const workspace = (workspacesQuery.data ?? []).find((w) => w.id === workspaceId) ?? null;

  useEffect(() => {
    if (!isEditingName && workspace) setNameDraft(workspace.name);
  }, [isEditingName, workspace]);

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

  // docs/10-abonelik-gelir-modeli.md — ekip üyeliği Plus ve İşletme planlarının özelliğidir
  // (plan_limits.max_team_members free'de null). Sunucu da reddeder
  // (create_workspace_invite → TEAM_PLAN_REQUIRED); buradaki kontrol yalnızca kullanıcıyı
  // hataya düşürmeden önce durdurmak ve neyin kilitli olduğunu göstermek içindir.
  // planQuery.data null gelirse (RPC henüz uygulanmamış bir ortam) hiçbir şey kilitlenmez —
  // limit bilgisi yokken kullanıcıyı yanlışlıkla engellemek, engellememekten daha kötüdür.
  const planQuery = usePlanEnforcement();
  const planState = planQuery.data ?? null;
  const teamLimit = planState?.teamMemberLimit ?? null;
  const teamLocked = !!planState && teamLimit === null;

  // Kilitli ekranda gösterilen plan başına üye sayıları sabit yazılmaz; paywall ile aynı
  // plan_limits kaynağından okunur ki limit değişince metin geride kalmasın.
  const planLimitsQuery = useQuery({
    queryKey: queryKeys.planLimits(),
    queryFn: getAllPlanLimits,
    enabled: teamLocked,
  });
  const plusTeamLimit = planLimitsQuery.data?.find((l) => l.plan === 'plus')?.max_team_members ?? null;
  const isletmeTeamLimit = planLimitsQuery.data?.find((l) => l.plan === 'isletme')?.max_team_members ?? null;

  function invalidateTeam() {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvites(workspaceId) });
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateWorkspaceName(workspaceId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      setIsEditingName(false);
    },
    onError: (error) => showErrorAlert(error, t('workspace.renameFailed')),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => deleteWorkspace(workspaceId),
    onSuccess: () => {
      if (activeWorkspaceId === workspaceId) setActiveWorkspaceId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      router.back();
    },
    onError: (error) => showErrorAlert(error, t('workspace.deleteFailed')),
  });

  const createInviteMutation = useMutation({
    mutationFn: () =>
      createWorkspaceInvite({ workspaceId, role: inviteRole, label: inviteLabel.trim() || null }),
    onSuccess: (invite) => {
      setInviteLabel('');
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
    onSuccess: (_data, removedUserId) => {
      if (removedUserId === myUserId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
        router.replace('/workspace');
      } else {
        invalidateTeam();
      }
    },
    onError: (error) => showErrorAlert(error),
  });

  function shareInvite(code: string) {
    const link = buildInviteLink(code);
    Share.share({
      message: t('workspace.inviteMessage', { code, link }),
    }).catch(() => {});
  }

  async function copyInvite(code: string) {
    const link = buildInviteLink(code);
    await Clipboard.setStringAsync(t('workspace.inviteMessage', { code, link }));
    setCopiedInviteId(code);
    setTimeout(() => setCopiedInviteId((current) => (current === code ? null : current)), 1800);
  }

  function confirmDeleteWorkspace() {
    if (!workspace) return;
    Alert.alert(
      t('workspace.deleteTitle', { name: workspace.name }),
      t('workspace.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(t('workspace.deleteSureTitle'), t('workspace.deleteSureBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('workspace.deletePermanent'), style: 'destructive', onPress: () => deleteWorkspaceMutation.mutate() },
            ]);
          },
        },
      ]
    );
  }

  function onMemberPress(member: WorkspaceMember) {
    if (!isOwner || member.role === 'owner' || member.user_id === myUserId) return;
    const name = member.full_name || member.email || t('workspace.memberFallback');
    Alert.alert(name, t('workspace.roleLine', { role: ROLE_LABEL[member.role] }), [
      member.role === 'viewer'
        ? { text: t('workspace.makeEditor'), onPress: () => roleMutation.mutate({ userId: member.user_id, role: 'editor' }) }
        : { text: t('workspace.makeViewer'), onPress: () => roleMutation.mutate({ userId: member.user_id, role: 'viewer' }) },
      {
        text: t('workspace.removeFromWorkspace'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('workspace.removeTitle'), t('workspace.removeBody', { name }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('workspace.remove'), style: 'destructive', onPress: () => removeMutation.mutate(member.user_id) },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function onLeave() {
    if (!myUserId || !workspace) return;
    Alert.alert(t('workspace.leaveTitle'), t('workspace.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('workspace.leave'), style: 'destructive', onPress: () => removeMutation.mutate(myUserId) },
    ]);
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const isActive = workspace?.id === activeWorkspaceId;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title={workspace?.name ?? t('workspace.defaultName')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        {workspace ? (
          <Card>
            <Stack gap="md">
              <Row align="center" style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color="textSecondary">
                  {workspace.type === 'business' ? t('workspace.businessUpper') : t('workspace.personalUpper')}
                </Text>
                <Text variant="caption" color={isActive ? 'textPrimary' : 'textSecondary'}>
                  {isActive ? t('workspace.activeUpper') : t('workspace.passiveUpper')}
                </Text>
              </Row>

              {isEditingName ? (
                <Stack gap="sm">
                  <TextField placeholder={t('workspace.namePlaceholder')} value={nameDraft} onChangeText={setNameDraft} autoFocus />
                  <Row gap="sm">
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('common.save')}
                        onPress={() => nameDraft.trim() && renameMutation.mutate(nameDraft.trim())}
                        loading={renameMutation.isPending}
                        disabled={!nameDraft.trim()}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label={t('common.cancel')} variant="secondary" onPress={() => setIsEditingName(false)} />
                    </View>
                  </Row>
                </Stack>
              ) : (
                <Pressable onPress={() => isOwner && setIsEditingName(true)} disabled={!isOwner}>
                  <Row align="center" style={{ justifyContent: 'space-between' }}>
                    <Text variant="sectionTitle" numberOfLines={1} style={{ flex: 1 }}>
                      {workspace.name}
                    </Text>
                    {isOwner ? <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} /> : null}
                  </Row>
                </Pressable>
              )}

              <Divider />

              <StatColumns
                columns={[
                  { label: t('workspace.statMembers'), value: members.length },
                  { label: t('workspace.statRole'), value: roleQuery.data ? ROLE_LABEL[roleQuery.data] : '—' },
                  ...(isOwner ? [{ label: t('workspace.statInvites'), value: invites.length }] : []),
                ]}
              />
            </Stack>
          </Card>
        ) : null}

        <Text variant="caption" color="textSecondary">
          {t('workspace.sharingNote')}
        </Text>

        {/* ÜYELER */}
        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            {t('workspace.membersUpper')}
          </Text>
          <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
            <Stack gap="xxs">
              {members.map((member) => {
                const tappable = isOwner && member.role !== 'owner' && member.user_id !== myUserId;
                return (
                  <Pressable key={member.user_id} onPress={() => onMemberPress(member)} disabled={!tappable}>
                    <Row gap="sm" style={{ padding: theme.spacing.md }} align="center">
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor:
                            member.role === 'owner' ? theme.colors.textPrimary : theme.colors.backgroundPrimary,
                        }}
                      >
                        <Text
                          variant="label"
                          style={{
                            color: member.role === 'owner' ? theme.colors.backgroundPrimary : theme.colors.textPrimary,
                            textTransform: 'none',
                          }}
                        >
                          {initials(member.full_name, member.email)}
                        </Text>
                      </View>
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="cardTitle" numberOfLines={1}>
                          {member.full_name || member.email || t('workspace.memberFallback')}
                          {member.user_id === myUserId ? t('workspace.you') : ''}
                        </Text>
                        <Text variant="caption" color="textSecondary" numberOfLines={1}>
                          {member.email ?? '—'}
                        </Text>
                      </Stack>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text variant="caption" color="textSecondary">
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
                  {membersQuery.isLoading ? t('workspace.loading') : t('workspace.noMembers')}
                </Text>
              ) : null}
            </Stack>
          </View>
        </Stack>

        {/* DAVETLER — yalnızca sahip */}
        {isOwner ? (
          <Stack gap="sm">
            <Text variant="label" color="textSecondary">
              {t('workspace.inviteUpper')}
            </Text>
            <Card>
              {teamLocked ? (
                <Stack gap="sm">
                  <Text variant="body">
                    {t('workspace.teamLocked')}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {plusTeamLimit && isletmeTeamLimit
                      ? t('workspace.teamLockedLimits', { plus: plusTeamLimit, isletme: isletmeTeamLimit })
                      : t('workspace.teamLockedGeneric')}
                  </Text>
                  <Button label={t('workspace.seePlans')} icon="people-outline" onPress={() => router.push('/paywall')} />
                </Stack>
              ) : (
                <Stack gap="md">
                  <TextField
                    placeholder={t('workspace.inviteLabelPlaceholder')}
                    value={inviteLabel}
                    onChangeText={setInviteLabel}
                  />
                  <SegmentedControl options={INVITE_ROLE_OPTIONS} value={inviteRole} onChange={setInviteRole} stretch />
                  <Button
                    label={t('workspace.createInvite')}
                    icon="person-add-outline"
                    onPress={() => createInviteMutation.mutate()}
                    loading={createInviteMutation.isPending}
                  />
                  {teamLimit !== null ? (
                    <Text variant="caption" color="textSecondary">
                      {t('workspace.inviteLimit', { count: teamLimit })}
                    </Text>
                  ) : null}
                </Stack>
              )}
            </Card>

            {invites.length > 0 ? (
              <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
                <Stack gap="xxs">
                  {invites.map((invite) => (
                    <Row key={invite.id} gap="sm" style={{ padding: theme.spacing.md }} align="center">
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="cardTitle">{invite.label || invite.code}</Text>
                        <Text variant="caption" color="textSecondary">
                          {invite.label ? `${invite.code} · ` : ''}
                          {ROLE_LABEL[(invite.role as WorkspaceRole)] ?? invite.role} · {t('workspace.usageCount', { count: invite.used_count })}
                        </Text>
                      </Stack>
                      <Pressable onPress={() => copyInvite(invite.code)} hitSlop={8}>
                        <Ionicons
                          name={copiedInviteId === invite.code ? 'checkmark' : 'copy-outline'}
                          size={20}
                          color={copiedInviteId === invite.code ? theme.colors.success : theme.colors.brandPrimary}
                        />
                      </Pressable>
                      <Pressable onPress={() => shareInvite(invite.code)} hitSlop={8}>
                        <Ionicons name="share-outline" size={20} color={theme.colors.textPrimary} />
                      </Pressable>
                      <Pressable onPress={() => revokeMutation.mutate(invite.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                      </Pressable>
                    </Row>
                  ))}
                </Stack>
              </View>
            ) : null}
          </Stack>
        ) : null}

        {/* Sahip olmayan üye ayrılabilir */}
        {roleQuery.isSuccess && !isOwner ? (
          <Button label={t('workspace.leaveWorkspace')} variant="danger" onPress={onLeave} loading={removeMutation.isPending} />
        ) : null}

        {/* Tehlikeli bölge — yalnızca sahip */}
        {isOwner ? (
          <Stack gap="sm" style={{ marginTop: theme.spacing.lg }}>
            <Text variant="label" color="textSecondary">
              {t('workspace.dangerZone')}
            </Text>
            <Button
              label={t('workspace.deleteWorkspace')}
              variant="danger"
              onPress={confirmDeleteWorkspace}
              loading={deleteWorkspaceMutation.isPending}
            />
          </Stack>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
