import type { subscriptionsList as tr } from '../tr/subscriptionsList';
import type { Messages } from '../../types';

export const subscriptionsList: Messages<typeof tr> = {
  sortUpcoming: 'Upcoming',
  sortPrice: 'Most expensive',
  sortCategory: 'Category',
  sortAccount: 'Card',
  all: 'All',
  uncategorized: 'Uncategorized',
  noAccount: 'No account',
  trialEnding: 'Trial ending',
  thisWeek: 'This week',
  thisMonth: 'This month',
  later: 'Later',
  yearly: 'Yearly',
  title: 'My Subscriptions',
  newSubscription: 'New subscription',
  emptyTitle: 'No subscriptions yet',
  emptyBody: 'Add recurring payments like Netflix or Spotify to see your monthly total and renewal dates here.',
  monthlyTotal: 'Monthly total',
  summary_one: '{{count}} subscription · about {{yearly}} a year',
  summary_other: '{{count}} subscriptions · about {{yearly}} a year',
  foreignNote: " · foreign currency at today's rate",
  trialEndsToday: 'Trial ends today',
  trialDays_one: 'Trial {{count}} day',
  trialDays_other: 'Trial {{count}} days',
  perYear: ' /yr',
};
