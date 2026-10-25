import type { instruments as tr } from '../tr/instruments';
import type { Messages } from '../../types';

export const instruments: Messages<typeof tr> = {
  open: 'Pending',
  overdue: 'Overdue',
  paid: 'Paid',
  bounced: 'Bounced',
  portfolioTotal: 'Portfolio total',
  payableTotal: 'Total to pay',
  totalFailed: "Couldn't update the total.",
  totalMissing: "The missing total couldn't be calculated.",
  title: 'Cheques and notes',
  newInstrument: 'New cheque or note',
  given: 'Issued · {{count}}',
  received: 'Received · {{count}}',
  summary_one: '{{label}} · {{count}} record',
  summary_other: '{{label}} · {{count}} records',
  calculating: 'Calculating TRY value…',
  summaryHint: 'TRY value at the current rate; bounced records are not included.',
  nearestDue: 'Nearest due date {{date}}',
  noReceived: 'No received cheques or notes',
  noGiven: 'No issued cheques or notes',
  emptyBody: 'You can scan a cheque or note, or add it manually.',
  add: 'Add cheque / note',
  note: 'Note',
  cheque: 'Cheque',
};
