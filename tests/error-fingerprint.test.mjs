// Yönetim paneline giden hata metinlerinin maskelenmesi. Gerekli: Node 22.18+.
import assert from 'node:assert/strict';
import { classifyError, fingerprint, httpSummary, isExpectedBusinessError, maskLogMessage, workspaceReleaseLabel } from '../supabase/functions/_shared/errorFingerprint.ts';

const card = 'invalid input syntax for type uuid: "card-due:bc990103-13b6-40fe-b4f3-6f3627f8c670:2026-11-20"';
assert.equal(maskLogMessage(card), 'invalid input syntax for type uuid: "card-due:<uuid>:<date>"');
assert.equal(
  maskLogMessage('invalid input syntax for type uuid: "Ayşe Yılmaz"'),
  'invalid input syntax for type uuid: "<value>"'
);
assert.equal(maskLogMessage('failed for ayse@example.com at 2026-11-08T12:04:58.205Z'), 'failed for <email> at <date>');
assert.equal(maskLogMessage('token eyJabc.def-1.ghi_2 end'), 'token <token> end');
assert.ok(maskLogMessage('x'.repeat(900)).length <= 300);

assert.deepEqual(
  httpSummary('POST | 500 | https://abc.supabase.co/functions/v1/send-cash-alerts?secret=1 | agent'),
  { status: '500', message: 'POST 500 /functions/v1/send-cash-alerts' }
);
assert.deepEqual(
  httpSummary('GET | 502 | https://abc.supabase.co/rest/v1/items/bc990103-13b6-40fe-b4f3-6f3627f8c670'),
  { status: '502', message: 'GET 502 /rest/v1/items/<uuid>' }
);
assert.equal(httpSummary('booted (time: 114ms)'), null);

assert.equal(classifyError({ code: '22P02', message: 'x' }), 'high');
assert.equal(classifyError({ code: '27000', message: 'x' }), 'high');
assert.equal(classifyError({ code: '500', message: 'x' }), 'high');
assert.equal(classifyError({ code: '42501', message: 'Workspace access denied' }), 'medium');
assert.equal(classifyError({ code: '42501', message: 'permission denied for schema supabase_migrations' }), 'low');
assert.equal(classifyError({ code: '42501', postgresSeverity: 'FATAL', message: 'x' }), 'high');

const release = 'ios/1.1.0/01a1eac6-3edd-7497-bcdb-b4e8335e36e5';
const label = detail => workspaceReleaseLabel('postgres', '42501', 'Workspace access denied', detail);
assert.ok(label(release).includes(release.split('/')[2]));
assert.ok(label('android/1.1.0/embedded').includes('android 1.1.0'));
assert.equal(label(null), '');
assert.equal(label('ios/1.1.0/user@example.com'), '');
assert.equal(workspaceReleaseLabel('postgres', '42501', 'permission denied', release), '');

assert.equal(isExpectedBusinessError('postgres', 'P0001', 'Geçersiz davet kodu'), true);
assert.equal(isExpectedBusinessError('postgres', 'P0001', 'Bu davetin süresi dolmuş'), true);
assert.equal(isExpectedBusinessError('postgres', '23514', 'TEAM_LIMIT_REACHED: Bu çalışma alanı <n> ekip üyesi limitine ulaştı.'), true);
assert.equal(isExpectedBusinessError('postgres', 'P0001', 'Oturum bulunamadı'), false);
assert.equal(isExpectedBusinessError('postgres', '23514', 'new row violates check constraint "transactions_amount_minor_check"'), false);
assert.equal(isExpectedBusinessError('function', 'P0001', 'Geçersiz davet kodu'), false);

const a = await fingerprint('postgres', '22P02', 'm');
assert.equal(a.length, 64);
assert.equal(a, await fingerprint('postgres', '22P02', 'm'));
assert.notEqual(a, await fingerprint('postgres', '22P02', 'n'));

console.log('error-fingerprint: tüm kontroller geçti');
