import type { receiptMatching as tr } from '../tr/receiptMatching';
import type { Messages } from '../../types';

export const receiptMatching: Messages<typeof tr> = {
  installmentAmount: 'Installment amount matched',
  remainingAmount: 'Remaining amount matched',
  openCounterparty: 'You have an open record with this person',
  counterpartyMatch: 'Counterparty matched',
  counterpartySimilar: 'Counterparty is similar',
};
