import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import {
  COUNTERPARTY_TYPES,
  COUNTERPARTY_TYPE_LABEL,
  createCounterparty,
  deleteCounterparty,
  getCounterparty,
  getCounterpartyType,
  updateCounterparty,
  type Counterparty,
  type CounterpartyType,
} from '@/features/counterparties/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';

const TYPES: { value: CounterpartyType; label: string }[] = COUNTERPARTY_TYPES.map((value) => ({
  value,
  label: COUNTERPARTY_TYPE_LABEL[value],
}));

export default function NewCounterpartyScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['counterparty', id],
    queryFn: () => getCounterparty(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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

  return <CounterpartyForm key={reflowKey} id={isEditing ? (id as string) : null} initial={existingQuery.data ?? null} />;
}

function CounterpartyForm({ id, initial }: { id: string | null; initial: Counterparty | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [type, setType] = useState<CounterpartyType>(getCounterpartyType(initial?.type));
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [taxNumber, setTaxNumber] = useState(initial?.tax_number ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const typeLabel = COUNTERPARTY_TYPE_LABEL[type];

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
      showSaveSuccess(
        isEditing ? `${typeLabel} başarıyla güncellendi.` : `${typeLabel} başarıyla oluşturuldu.`,
        () => router.back(),
        invalidate
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCounterparty(id as string),
    onSuccess: () => {
      showSaveSuccess(`${typeLabel} başarıyla silindi.`, () => router.back(), invalidate);
    },
    onError: () => {
      Alert.alert(
        'Silinemedi',
        'Bu cari işlem veya borç/alacak kayıtlarında kullanılıyor. Önce ilişkili kayıtları güncelleyin.'
      );
    },
  });

  function confirmDelete() {
    Alert.alert(`${typeLabel} Kaydını Sil`, 'Bu kayıt kalıcı olarak silinecek. Emin misiniz?', [
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
              {isEditing ? `${typeLabel} Kaydını Düzenle` : 'Yeni Cari'}
            </Text>
          </Row>

          <SegmentedControl
            options={TYPES.map((t) => ({ key: t.value, label: t.label }))}
            value={type}
            onChange={setType}
            stretch
          />

          <TextField
            label="AD"
            placeholder={type === 'company' ? 'Firma adı' : 'Ad Soyad'}
            value={name}
            onChangeText={setName}
          />

          <TextField
            label="TELEFON (İSTEĞE BAĞLI)"
            placeholder="05xx xxx xx xx"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <TextField
            label="E-POSTA (İSTEĞE BAĞLI)"
            placeholder="ornek@eposta.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextField
            label={
              type === 'company'
                ? 'VERGİ NUMARASI (İSTEĞE BAĞLI)'
                : type === 'personel'
                  ? 'TC KİMLİK NUMARASI (İSTEĞE BAĞLI)'
                  : 'TC/VERGİ NUMARASI (İSTEĞE BAĞLI)'
            }
            placeholder="Numara"
            value={taxNumber}
            onChangeText={setTaxNumber}
            keyboardType="number-pad"
          />

          <TextField label="NOT (İSTEĞE BAĞLI)" placeholder="Ek bilgi" value={notes} onChangeText={setNotes} />

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
