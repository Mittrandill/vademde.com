import type { support as trSupport } from '../tr/support';
import type { Messages } from '../../types';

export const support: Messages<typeof trSupport> = {
  title: 'Support',
  newRequest: 'New request',
  emptyTitle: 'No support requests yet',
  emptyBody: 'Tell us about a problem or an idea; our reply arrives here and as a notification.',
  loadFailed: 'Support requests could not be loaded.',
  newReply: 'New reply',
  fromWeb: 'Web',
  newTitle: 'New support request',
  subject: 'Subject',
  subjectPlaceholder: 'E.g. Subscription not showing in calendar',
  message: 'Message',
  messagePlaceholder: 'Describe the problem or idea in as much detail as you can.',
  send: 'Send',
  sendFailed: 'Message could not be sent. Please try again.',
  threadLoadFailed: 'Conversation could not be loaded.',
  you: 'You',
  supportTeam: 'Vademde Support',
  replyPlaceholder: 'Write a reply',
  sendA11y: 'Send',
  awaitingReply: 'We received your message. Our reply will arrive here and as a notification.',
};
