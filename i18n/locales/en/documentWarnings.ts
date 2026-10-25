import type { documentWarnings as tr } from '../tr/documentWarnings';
import type { Messages } from '../../types';

export const documentWarnings: Messages<typeof tr> = {
  amountMismatch: 'The amounts in figures and words do not match',
  uncertainAmount: 'Uncertain amount reading: the document says "{{raw}}". The recorded amount is {{amount}}; please verify it.',
  cleanupFailed: '{{error}}; the uploaded original document could not be removed: {{cleanupError}}',
  quotaExceeded: 'You have reached your monthly OCR limit',
};
