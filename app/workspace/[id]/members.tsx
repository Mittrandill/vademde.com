import { useEffect, useState } from 'react';
import { Alert, Share, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
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
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';

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
    onError: (error) => showErrorAlert(error, 'Çalışma alanı adı güncellenemedi.'),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => deleteWorkspace(workspaceId),
    onSuccess: () => {
      if (activeWorkspaceId === workspaceId) setActiveWorkspaceId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      router.back();
    },
    onError: (error) => showErrorAlert(error, 'Çalışma alanı silinemedi.'),
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
      message: `Vademde çalışma alanıma katıl. Davet kodu: ${code}\n${link}`,
    }).catch(() => {});
  }

  async function copyInvite(code: string) {
    const link = buildInviteLink(code);
    await Clipboard.setStringAsync(`Vademde çalışma alanıma katıl. Davet kodu: ${code}\n${link}`);
    setCopiedInviteId(code);
    setTimeout(() => setCopiedInviteId((current) => (current === code ? null : current)), 1800);
  }

  function confirmDeleteWorkspace() {
    if (!workspace) return;
    Alert.alert(
      `"${workspace.name}" çalışma alanını sil`,
      'Bu işlem geri alınamaz. Bu çalışma alanındaki tüm hesaplar, işlemler, borç/alacak kayıtları ve belgeler kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Emin misin?', 'Bu son bir uyarıdır. Bu veriler kurtarılamaz.', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Kalıcı Olarak Sil', style: 'destructive', onPress: () => deleteWorkspaceMutation.mutate() },
            ]);
          },
        },
      ]
    );
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
    if (!myUserId || !workspace) return;
    Alert.alert('Ayrıl', 'Bu çalışma alanından ayrılmak istediğinize emin misiniz? Erişiminiz kaldırılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: () => removeMutation.mutate(myUserId) },
    ]);
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const isActive = workspace?.id === activeWorkspaceId;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title={workspace?.name ?? 'Çalışma Alanı'} />
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
                  {workspace.type === 'business' ? 'İŞLETME' : 'KİŞİSEL'}
                </Text>
                <View
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 3,
                    borderRadius: theme.radius.pill,
                    backgroundColor: withAlpha(isActive ? theme.colors.success : theme.colors.textSecondary, 0.15),
                  }}
                >
                  <Text variant="caption" style={{ color: isActive ? theme.colors.success : theme.colors.textSecondary, fontWeight: '600' }}>
                    {isActive ? 'Aktif' : 'Pasif'}
                  </Text>
                </View>
              </Row>

              {isEditingName ? (
                <Stack gap="sm">
                  <TextField placeholder="Çalışma alanı adı" value={nameDraft} onChangeText={setNameDraft} autoFocus />
                  <Row gap="sm">
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Kaydet"
                        onPress={() => nameDraft.trim() && renameMutation.mutate(nameDraft.trim())}
                        loading={renameMutation.isPending}
                        disabled={!nameDraft.trim()}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Vazgeç" variant="secondary" onPress={() => setIsEditingName(false)} />
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
                  { label: 'ÜYE', value: members.length },
                  { label: 'ROLÜNÜZ', value: roleQuery.data ? ROLE_LABEL[roleQuery.data] : '—' },
                  ...(isOwner ? [{ label: 'AKTİF DAVET', value: invites.length }] : []),
                ]}
              />
            </Stack>
          </Card>
        ) : null}

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
                <TextField
                  placeholder="Davet etiketi (isteğe bağlı, ör. Muhasebe ekibi)"
                  value={inviteLabel}
                  onChangeText={setInviteLabel}
                />
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
                        <Text variant="cardTitle">{invite.label || invite.code}</Text>
                        <Text variant="caption" color="textSecondary">
                          {invite.label ? `${invite.code} · ` : ''}
                          {ROLE_LABEL[(invite.role as WorkspaceRole)] ?? invite.role} · {invite.used_count} kullanım
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

        {/* Tehlikeli bölge — yalnızca sahip */}
        {isOwner ? (
          <Stack gap="sm" style={{ marginTop: theme.spacing.lg }}>
            <Text variant="caption" color="textSecondary">
              TEHLİKELİ BÖLGE
            </Text>
            <Button
              label="Çalışma Alanını Sil"
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
