import type { calendar as tr } from '../tr/calendar';
import type { Messages } from '../../types';

export const calendar: Messages<typeof tr> = {
  title: 'Calendar',
  month: 'Month',
  week: 'Week',
  list: 'List',
  loadFailed: "Couldn't load the calendar",
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  emptyDay: 'No records are due on this date.',
  emptyRange: 'No records are due in this range.',
  payableUpper: 'TO PAY',
  receivableUpper: 'TO COLLECT',
  netUpper: 'NET',
  legendPayable: 'To pay',
  legendReceivable: 'To collect',
  legendInstruments: 'Cheque / Note',
  legendLoan: 'Loan',
  currentCardDebt: 'Current card debt',
  pay: 'Pay',
  collect: 'Collect',
};
