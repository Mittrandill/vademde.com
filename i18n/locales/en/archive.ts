import type { archive as tr } from '../tr/archive';
import type { Messages } from '../../types';

export const archive: Messages<typeof tr> = {
  counterpartyTitle: "{{name}}'s receipts",
  counterpartyFallback: 'Counterparty',
  title: 'Document archive',
  loadFailed: "Couldn't load the archive",
  lockedTitle: 'Document archive is on Plus',
  lockedBody: 'Attach receipts, photos or PDFs to payments; they are all stored here and open with a tap.',
  seePlans: 'See plans',
  search: 'Search people, companies or records',
  noResults: 'No results',
  empty: 'No receipts yet',
  noResultsBody: 'No receipts match your search.',
  emptyBody: 'Attach a receipt when adding a payment or scan one, and it will appear here.',
};
