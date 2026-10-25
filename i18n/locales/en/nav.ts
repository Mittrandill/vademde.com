import type { nav as tr } from '../tr/nav';
import type { Messages } from '../../types';

export const nav: Messages<typeof tr> = {
  tabs: {
    home: 'Home',
    transactions: 'Transactions',
    scan: 'Scan',
    calendar: 'Calendar',
    more: 'More',
  },
  more: {
    title: 'More',
    completeProfile: 'Complete your profile',
    tryPlus: 'Try Vademde Plus',
    scansLeft: 'Scans left',
    recordTypes: 'Record types',
    instruments: 'Cheques and notes',
    loans: 'My loans',
    creditCards: 'My credit cards',
    subscriptions: 'My subscriptions',
    counterparties: 'Contacts / Counterparties',
    management: 'Management',
    accounts: 'Accounts',
    banks: 'Banks',
    valueUnits: 'Currencies and gold',
    reports: 'Reports',
    insights: 'Smart insights',
    archive: 'Document archive',
    workspaces: 'Workspaces',
    members: 'Workspace members',
    app: 'App',
    settings: 'Settings',
    categories: 'Categories',
    appearance: 'Appearance',
    notifications: 'Notifications',
    subscriptionSettings: 'Subscription settings',
  },
};
