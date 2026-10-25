import type { tr } from '../tr';
import type { Messages } from '../../types';
import { accounts } from './accounts';
import { archive } from './archive';
import { auth } from './auth';
import { banks } from './banks';
import { calendar } from './calendar';
import { cashAlert } from './cashAlert';
import { categories } from './categories';
import { common } from './common';
import { counterparties } from './counterparties';
import { domain } from './domain';
import { errors } from './errors';
import { finance } from './finance';
import { home } from './home';
import { insights } from './insights';
import { instruments } from './instruments';
import { nav } from './nav';
import { notifications } from './notifications';
import { obligations } from './obligations';
import { onboarding } from './onboarding';
import { plans } from './plans';
import { profile } from './profile';
import { reports } from './reports';
import { scan } from './scan';
import { search } from './search';
import { settings } from './settings';
import { subscription } from './subscription';
import { subscriptionsList } from './subscriptionsList';
import { transactions } from './transactions';
import { ui } from './ui';
import { widgets } from './widgets';
import { workspace } from './workspace';

export const en: Messages<typeof tr> = {
  accounts,
  archive,
  auth,
  banks,
  calendar,
  cashAlert,
  categories,
  common,
  counterparties,
  domain,
  errors,
  finance,
  home,
  insights,
  instruments,
  nav,
  notifications,
  obligations,
  onboarding,
  plans,
  profile,
  reports,
  scan,
  search,
  settings,
  subscription,
  subscriptionsList,
  transactions,
  ui,
  widgets,
  workspace,
};
