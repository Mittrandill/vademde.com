import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { Button, Card, Stack, Text } from '@/components/primitives';
import { createCounterparty } from '@/features/counterparties/api';
import { guessCounterpartyType } from '@/features/counterparties/match';
import { BANK_DOCUMENT_TYPES, COUNTERPARTY_LESS_DOCUMENT_TYPES } from '@/features/obligations/documentTypes';
import { isForeignAmountWithheld } from '@/features/voice/route';
import { formatMinorAmount } from '@/utils/money';
import { useVoiceDraftStore } from '@/features/voice/store';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { friendlyErrorMessage, showErrorAlert } from '@/utils/alerts';
import { queryKeys } from '@/services/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '@/i18n';

const FIELD_KEYS: Record<string, 'voice.fields.accounts' | 'voice.fields.amount' | 'voice.fields.date' | 'voice.fields.counterparty' | 'voice.fields.documentNumber' | 'voice.fields.bank' | 'voice.fields.direction'> = {
  accounts: 'voice.fields.accounts',
  amount: 'voice.fields.amount',
  date: 'voice.fields.date',
  counterparty: 'voice.fields.counterparty',
  documentNumber: 'voice.fields.documentNumber',
  bank: 'voice.fields.bank',
  direction: 'voice.fields.direction',
};

// Sesli taslaktan açılan formda duyulan metni, kontrol edilecek alanları ve yeni cari önerisini gösterir.
export function VoiceDraftNotice({ onCounterpartyCreated }: { onCounterpartyCreated?: (id: string) => void }) {
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const draft = useVoiceDraftStore((s) => s.draft);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  if (voice !== '1' || !draft) return null;

  // Bu kayıtlarda formda cari alanı yoktur (kredide banka, abonelikte servis, transferde hesap).
  const hasNoCounterparty =
    COUNTERPARTY_LESS_DOCUMENT_TYPES.has(draft.documentType ?? '') || draft.documentType === 'abonelik' || draft.direction === 'transfer';
  const hasBankField = BANK_DOCUMENT_TYPES.has(draft.documentType ?? '');
  const amountWithheld = isForeignAmountWithheld(draft) && draft.amountMinor !== null;
  // Ses en çok rakamlarda yanılır; tutar, tarih ve belge no düşük güven işareti olmasa da hep gösterilir.
  const review = [
    ...new Set(['amount', ...(draft.accountId || draft.transferToAccountId ? ['accounts'] : []), ...(draft.date ? ['date'] : []), ...(draft.documentNumber ? ['documentNumber'] : []), ...draft.lowConfidence]),
  ].filter((field) => FIELD_KEYS[field] && !(field === 'counterparty' && hasNoCounterparty) && !(field === 'bank' && !hasBankField));
  const canCreate = !hasNoCounterparty && !created && !draft.counterpartyId && !!draft.counterpartyName && !!workspaceId && !!onCounterpartyCreated;

  const handleCreate = async () => {
    if (!draft.counterpartyName || !workspaceId) return;
    setCreating(true);
    try {
      const counterparty = await createCounterparty({
        workspace_id: workspaceId,
        name: draft.counterpartyName,
        type: draft.documentType === 'maas' ? 'personel' : guessCounterpartyType(draft.counterpartyName),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(workspaceId) });
      onCounterpartyCreated?.(counterparty.id);
      setCreated(true);
    } catch (error) {
      showErrorAlert(friendlyErrorMessage(error, t('voice.counterpartyFailed')));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <Stack gap="xs">
        <Text variant="caption" color="textSecondary">{t('voice.heard')}</Text>
        <Text variant="body">{draft.transcript}</Text>
        <Text variant="caption" color="attentionMarker">
          {t('voice.checkFields', { fields: review.map((field) => t(FIELD_KEYS[field]!)).join(', ') })}
        </Text>
        {amountWithheld ? (
          <Text variant="caption" color="attentionMarker">
            {t('voice.foreignAmount', { amount: formatMinorAmount(draft.amountMinor as number, draft.currency) })}
          </Text>
        ) : null}
        {canCreate ? (
          <Button
            variant="secondary"
            size="compact"
            label={t('voice.addCounterparty', { name: draft.counterpartyName })}
            loading={creating}
            onPress={handleCreate}
          />
        ) : null}
      </Stack>
    </Card>
  );
}
