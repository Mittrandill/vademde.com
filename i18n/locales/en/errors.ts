import type { errors as tr } from '../tr/errors';
import type { Messages } from '../../types';

export const errors: Messages<typeof tr> = {
  generic: "Couldn't complete the action. Please try again.",
  network: "Couldn't connect to the internet. Check your connection and try again.",
  checkConnection: 'Check your internet connection and try again.',
  success: 'Done',
  failedTitle: "Couldn't complete",
  noConnectionTitle: 'No connection',
  noPermissionTitle: 'No permission',
  viewerOnly: 'You only have view access in this workspace.',
  viewerOnlyDetail:
    'You only have view access in this workspace. Ask the workspace owner for the editor role to make changes.',
  seePlans: 'See plans',
  plan: {
    workspaceLimitTitle: 'Workspace limit',
    workspaceLimit: 'The Free plan includes one workspace. Upgrade your plan to use more.',
    workspaceReadOnlyTitle: 'Workspace is read-only',
    workspaceReadOnly:
      'The Free plan includes one workspace. Your data here is kept and readable; to add records again, upgrade your plan or make this your primary workspace.',
    teamTitle: 'Team feature',
    team: 'Inviting team members is available on the Plus and Business plans.',
    receiptArchiveTitle: 'Document archive',
    receiptArchive: 'Attaching and archiving receipts on payments is available on the Plus plan.',
    teamLimitTitle: 'Team member limit',
    teamLimit: "This workspace has reached your plan's team member limit.",
  },
  auth: {
    invalid_credentials: 'Incorrect email or password.',
    email_not_confirmed: "Your email address isn't verified yet. Check your inbox.",
    user_already_exists: 'An account with this email already exists. Try signing in.',
    identity_already_exists: 'This account is already linked.',
    weak_password: 'Your password is too weak. Use at least 6 characters.',
    same_password: 'The new password must be different from the old one.',
    user_not_found: 'No account was found with these details.',
    user_banned: 'Access to this account is restricted. Please contact support.',
    signup_disabled: "We aren't accepting new sign-ups right now.",
    email_address_invalid: 'Enter a valid email address.',
    email_address_not_authorized: "You can't sign up with this email address.",
    rate_limit: 'Too many attempts. Please try again in a few minutes.',
    captcha_failed: 'Verification failed. Please try again.',
    session_expired: 'Your session has expired. Please sign in again.',
    oauth_retry: "This sign-in method isn't available right now. Please try again.",
    oauth_unavailable: "This sign-in method isn't available right now.",
    request_timeout: 'The request timed out. Please try again.',
  },
};
