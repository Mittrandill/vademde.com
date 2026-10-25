import type { search as tr } from '../tr/search';
import type { Messages } from '../../types';

export const search: Messages<typeof tr> = {
  placeholder: 'Search counterparties, transactions or records',
  clear: 'Clear search',
  title: 'Search',
  hint: 'Type a counterparty name, transaction description or record title. At least 2 letters are needed.',
  noResults: 'No results found',
  noMatch: 'Nothing matches “{{query}}”.',
  all: 'All · {{count}}',
  counterparties: 'Counterparties · {{count}}',
  transactions: 'Transactions · {{count}}',
  obligations: 'Records · {{count}}',
  sectionCounterparties: 'Counterparties',
  sectionTransactions: 'Transactions',
  sectionObligations: 'Records',
  seeAll: 'All {{count}} results',
  transactionFallback: 'Transaction',
};
