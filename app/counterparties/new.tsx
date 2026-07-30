import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import {
  createCounterparty,
  deleteCounterparty,
  getCounterparty,
  updateCounterparty,
  type Counterparty,
} from '@/features/counterparties/api';
import { useWorkspaceStore } from '@/store/workspaceStore';

type PartyType = 'individual' | 'company';

const TYPES: Array<{ value: PartyType; label: string }> = [
  { value: 'individual', label: 'Kişi' },
  { value: 'company', label: 'Firma' },
];

export default function NewCounterpartyScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['counterparty', id],
    queryFn: () => getCounterparty(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {existingQuery.error ? (
            <Text variant="body" color="danger">
              {existingQuery.error instanceof Error ? existingQuery.error.message : 'Kayıt yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  return <CounterpartyForm id={isEditing ? (id as string) : null} initial={existingQuery.data ?? null} />;
}

function CounterpartyForm({ id, initial }: { id: string | null; initial: Counterparty | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [type, setType] = useState<PartyType>((initial?.type as PartyType) ?? 'individual');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [taxNumber, setTaxNumber] = useState(initial?.tax_number ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function invalidate() {
    if (activeWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'counterparties'] });
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !name.trim()) throw new Error('Ad zorunlu');
      const payload = {
        name: name.trim(),
        type,
        phone: phone.trim() || null,
        email: email.trim() || null,
        tax_number: taxNumber.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEditing) return updateCounterparty(id, payload);
      return createCounterparty({ workspace_id: activeWorkspaceId, ...payload });
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCounterparty(id as string),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: () => {
      Alert.alert(
        'Silinemedi',
        'Bu kişi/firma işlem veya borç/alacak kayıtlarında kullanılıyor. Önce ilişkili kayıtları güncelleyin.'
      );
    },
  });

  function confirmDelete() {
    Alert.alert('Kişi/Firmayı Sil', 'Bu kayıt kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              {isEditing ? 'Kişi/Firmayı Düzenle' : 'Yeni Kişi/Firma'}
            </Text>
          </Row>

          <Row gap="xs">
            {TYPES.map((option) => {
              const selected = option.value === type;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setType(option.value)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radius.input,
                    backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
                  }}
                >
                  <Text
                    variant="body"
                    style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textPrimary }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              AD
            </Text>
            <TextField placeholder={type === 'company' ? 'Firma adı' : 'Ad Soyad'} value={name} onChangeText={setName} />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              TELEFON (İSTEĞE BAĞLI)
            </Text>
            <TextField placeholder="05xx xxx xx xx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              E-POSTA (İSTEĞE BAĞLI)
            </Text>
            <TextField
              placeholder="ornek@eposta.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              {type === 'company' ? 'VERGİ NUMARASI (İSTEĞE BAĞLI)' : 'TC/VERGİ NUMARASI (İSTEĞE BAĞLI)'}
            </Text>
            <TextField placeholder="Numara" value={taxNumber} onChangeText={setTaxNumber} keyboardType="number-pad" />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              NOT (İSTEĞE BAĞLI)
            </Text>
            <TextField placeholder="Ek bilgi" value={notes} onChangeText={setNotes} />
          </Stack>

          {saveMutation.error ? (
            <Text variant="caption" color="danger">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt kaydedilemedi'}
            </Text>
          ) : null}

          <Button
            label={isEditing ? 'Güncelle' : 'Kaydet'}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!name.trim()}
          />

          {isEditing ? (
            <Button
              label="Sil"
              variant="danger"
              onPress={confirmDelete}
              loading={deleteMutation.isPending}
              disabled={saveMutation.isPending}
            />
          ) : null}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
