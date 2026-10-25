import type { insights as tr } from '../tr/insights';
import type { Messages } from '../../types';

export const insights: Messages<typeof tr> = {
  consentText:
    'To generate insights and answers, a summary of your transaction and due-date records is sent over a secure connection to a smart analysis service. Document images are not sent. Figures are calculated from your records; nothing changes without your approval.',
  disclaimer: 'Insights are for information only; they are not investment or credit advice.',
  title: 'Smart insights',
  all: 'All · {{count}}',
  savingPotential: 'Savings potential',
  perMonth: '/ month',
  derivedNote: 'Derived from your records. Nothing changes without your approval.',
  analyzing: 'Reviewing your records',
  noneYet: 'No insights for now',
  noneBody: 'As enough records build up, recurring subscriptions and rising spending will appear here.',
  ask: 'Ask something',
  gap: ' shortfall',
  perMonthShort: '/mo',
  review: 'Review',
  hideA11y: 'Hide this insight',
  hide: 'Hide',
  askTitle: 'Ask',
  suggestion1: 'Where did I spend this month?',
  suggestion2: 'Compare with last month',
  suggestion3: 'Which category do I spend the most on?',
  noAnswer: "Couldn't get an answer.",
  askIntro: 'I answer your questions based on your records.',
  source: 'Source: {{count}} transactions · {{from}} – {{to}}',
  analyzingDots: 'Reviewing your records…',
  answerDisclaimer: 'Answers are based on your records; double-check important decisions.',
  placeholder: 'Type your question',
  send: 'Send',
};
