import type { cashAlert as tr } from '../tr/cashAlert';
import type { Messages } from '../../types';

export const cashAlert: Messages<typeof tr> = {
  title: 'Cash alert',
  notFoundTitle: 'Account not found',
  notFoundBody: "A forecast couldn't be calculated for this account.",
  goesNegative: '{{account}} may go negative on {{date}}',
  staysPositive: "{{account}} doesn't go negative in the next {{days}} days",
  totalHint: 'All recorded due dates, including records without an assigned account, are applied to the total balance of all TRY accounts.',
  accountHint: 'The forecast is based on recorded due dates paid from / collected into this account.',
  lowest: 'Projected lowest balance',
  chartA11y: 'Projected balance chart for the next {{days}} days',
  outgoing: 'Going out of this account',
  noOutgoing: 'No payables are linked to this account.',
  whatToDo: 'What can you do?',
  transferFrom: 'Transfer {{amount}} from {{account}}',
  changeAccount: 'Change the payment account',
};
