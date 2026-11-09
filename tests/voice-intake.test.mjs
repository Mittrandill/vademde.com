// Sesli kayıt kuralları ve cari eşleştirme. Gerekli: Node 22.18+.
import assert from 'node:assert/strict';
import {
  applyChipAnswer, mergeFollowUp, nextVoiceQuestion, normalizeVoiceDraft, voiceAcknowledgement,
} from '../supabase/functions/_shared/voiceIntake.ts';
import { isForeignAmountWithheld, voiceDraftRoute } from '../features/voice/route.ts';
import { guessCounterpartyType, matchCounterparty, normalizeCounterpartyName } from '../features/counterparties/match.ts';

const context = {
  today: '2026-11-09',
  counterparties: [{ id: 'c1', name: 'Kuzey Lojistik A.Ş.' }, { id: 'c2', name: 'Ahmet Demir' }, { id: 'c3', name: 'Ahmet Demir' }],
  categories: [{ id: 'k1', name: 'Yakıt', kind: 'expense' }, { id: 'k2', name: 'Danışmanlık', kind: 'income' }],
  assets: [{ id: 'a1', name: 'Fiat Egea', kind: 'vehicle', plate: '34 ABC 12' }, { id: 'a2', name: 'Dükkan', kind: 'commercial', plate: null }],
};
const draft = (raw) => normalizeVoiceDraft({ transcript: 'x', lowConfidence: [], ...raw }, context);

// Çek taslağı
const cheque = draft({ kind: 'obligation', documentType: 'cek', direction: 'receivable', amountMinor: 20000000, date: '2026-12-12', documentNumber: '0123456', counterparty: 'Kuzey Lojistik', bank: 'Garanti' });
assert.equal(cheque.counterpartyId, 'c1');
assert.equal(cheque.documentNumber, '0123456');
assert.equal(nextVoiceQuestion(cheque, context, [], 'tr'), null);
assert.equal(voiceAcknowledgement(cheque, 'tr'), 'Tamam, çeki işliyorum.');

// Geçersiz değerler kesin veri olarak geçmez
const invalid = draft({ kind: 'obligation', documentType: 'uydurma', direction: 'income', amountMinor: 10.5, date: '2026-02-31', currency: 'tl' });
assert.equal(invalid.documentType, 'diger');
assert.equal(invalid.direction, null);
assert.equal(invalid.amountMinor, null);
assert.equal(invalid.date, null);
assert.equal(invalid.currency, 'TRY');
assert.equal(draft({ kind: 'bilinmeyen' }).kind, 'unsupported');
assert.equal(draft({ kind: 'obligation', amountMinor: 0 }).amountMinor, null);
assert.equal(draft({ kind: 'obligation', installments: 999 }).installments, null);

// Aynı adlı iki cari varsa otomatik seçilmez, yeni cari adı korunur
const twin = draft({ kind: 'payment', direction: 'receivable', amountMinor: 500000, counterparty: 'Ahmet Demir' });
assert.equal(twin.counterpartyId, null);
assert.equal(twin.counterpartyName, 'Ahmet Demir');
assert.equal(twin.date, '2026-11-09', 'gerçekleşen ödemede tarih bugündür');
assert.equal(draft({ kind: 'obligation', documentType: 'fatura', direction: 'payable', amountMinor: 1 }).date, null, 'vade uydurulmaz');
const fresh = draft({ kind: 'obligation', documentType: 'senet', direction: 'receivable', counterparty: 'Mehmet Aslan' });
assert.equal(fresh.counterpartyId, null);
assert.equal(fresh.counterpartyName, 'Mehmet Aslan');

// Kategori yönüne göre eşleşir
assert.equal(draft({ kind: 'transaction', direction: 'expense', category: 'Yakıt' }).categoryId, 'k1');
assert.equal(draft({ kind: 'transaction', direction: 'income', category: 'Yakıt' }).categoryId, null);

// Soru sırası ve tür bazlı kurallar
const bill = draft({ kind: 'obligation', documentType: 'fatura', direction: 'payable', date: '2026-11-15' });
assert.equal(nextVoiceQuestion(bill, context, [], 'tr').field, 'amount');
assert.equal(nextVoiceQuestion(bill, context, ['amount'], 'tr'), null);
const noDirection = draft({ kind: 'obligation', documentType: 'cek' });
const directionQuestion = nextVoiceQuestion(noDirection, context, [], 'tr');
assert.equal(directionQuestion.field, 'direction');
assert.equal(directionQuestion.type, 'chips');
assert.equal(nextVoiceQuestion(draft({ kind: 'obligation', documentType: 'cek', direction: 'payable', amountMinor: 1, date: '2027-01-01' }), context, [], 'tr').field, 'counterparty');
assert.equal(nextVoiceQuestion(draft({ kind: 'obligation', documentType: 'cek', direction: 'payable', amountMinor: 1, date: '2027-01-01', counterparty: 'X' }), context, [], 'tr').field, 'documentNumber');
const loan = draft({ kind: 'obligation', documentType: 'kredi', direction: 'payable', amountMinor: 1, date: '2027-01-01' });
assert.equal(nextVoiceQuestion(loan, context, [], 'tr').field, 'bank');
assert.equal(nextVoiceQuestion(loan, context, ['bank'], 'tr').field, 'installments');
assert.equal(nextVoiceQuestion(draft({ kind: 'payment', direction: 'payable', amountMinor: 1 }), context, [], 'tr').field, 'counterparty');
assert.equal(nextVoiceQuestion(draft({ kind: 'unsupported' }), context, [], 'tr'), null);
assert.equal(nextVoiceQuestion(noDirection, context, ['bank', 'date', 'amount'], 'tr'), null, 'en fazla üç soru');

// Varlık çipleri
const fuel = draft({ kind: 'transaction', direction: 'expense', amountMinor: 300000, category: 'Yakıt', transcript: 'yakıt aldım' });
const assetQuestion = nextVoiceQuestion(fuel, context, [], 'tr');
assert.equal(assetQuestion.field, 'asset');
assert.deepEqual(assetQuestion.options.map((o) => o.value), ['a1', '']);
assert.match(assetQuestion.options[0].label, /34 ABC 12/);
const rent = draft({ kind: 'obligation', documentType: 'kira', direction: 'payable', amountMinor: 1, date: '2026-12-05', transcript: 'dükkan kirası' });
assert.deepEqual(nextVoiceQuestion(rent, context, [], 'tr').options.map((o) => o.value), ['a2', '']);
assert.equal(nextVoiceQuestion(draft({ kind: 'transaction', direction: 'expense', amountMinor: 1, transcript: 'market' }), context, [], 'tr'), null);
assert.equal(nextVoiceQuestion(fuel, { ...context, assets: [] }, [], 'tr'), null, 'varlık yoksa sorulmaz');
assert.equal(nextVoiceQuestion(draft({ kind: 'transaction', direction: 'expense', amountMinor: 1, transcript: 'yakıt', asset: 'Fiat Egea' }), context, [], 'tr'), null, 'söylendiyse sorulmaz');
assert.equal(applyChipAnswer(fuel, context, 'asset', 'a1').assetId, 'a1');
assert.equal(applyChipAnswer(fuel, context, 'asset', '').assetId, null);
assert.equal(applyChipAnswer(fuel, context, 'asset', 'baska-calisma-alani').assetId, null, 'yabancı varlık kabul edilmez');

// Takip yanıtı yalnızca sorulan alanı değiştirir
const answer = draft({ kind: 'obligation', direction: 'receivable', amountMinor: 234050, date: '2030-01-01', counterparty: 'Başka', lowConfidence: ['amount'] });
const merged = mergeFollowUp(bill, answer, 'amount');
assert.equal(merged.amountMinor, 234050);
assert.equal(merged.direction, 'payable');
assert.equal(merged.date, '2026-11-15');
assert.equal(merged.counterpartyName, null);
assert.deepEqual(merged.lowConfidence, ['amount']);
assert.equal(mergeFollowUp(bill, draft({ kind: 'obligation' }), 'amount').amountMinor, null);

// Cari eşleştirme
const list = [{ id: '1', name: 'Migros Ticaret A.Ş.', tax_number: '1234567890' }, { id: '2', name: 'Kaya İnşaat' }, { id: '3', name: 'Kaya Tekstil' }];
assert.equal(normalizeCounterpartyName('MİGROS TİCARET A.Ş.'), 'migros');
assert.equal(matchCounterparty({ name: 'Migros' }, list), '1');
assert.equal(matchCounterparty({ name: 'Bambaşka Ad', taxNumber: '123 456 7890' }, list), '1');
assert.equal(matchCounterparty({ name: 'Kaya' }, list), null, 'birden çok aday seçilmez');
assert.equal(matchCounterparty({ name: 'Kaya İnşaat Ltd. Şti.' }, list), '2');
assert.equal(matchCounterparty({ name: '' }, list), null);
assert.equal(guessCounterpartyType('Atlas Yapı A.Ş.'), 'company');
assert.equal(guessCounterpartyType('Delta Hırdavat Ltd. Şti.'), 'company');
assert.equal(guessCounterpartyType('Ahmet Şahin'), 'individual');

// Taslak doğru ekrana gider; boş alan parametreye yazılmaz
const chequeRoute = voiceDraftRoute(cheque, { bankCode: 'garanti', title: 'Çek', notes: 'Belge no: 0123456' });
assert.equal(chequeRoute.pathname, '/obligations/new');
assert.deepEqual(
  { type: chequeRoute.params.type, direction: chequeRoute.params.direction, amountMinor: chequeRoute.params.amountMinor, dueDate: chequeRoute.params.dueDate, counterpartyId: chequeRoute.params.counterpartyId, bankCode: chequeRoute.params.bankCode, voice: chequeRoute.params.voice },
  { type: 'cek', direction: 'receivable', amountMinor: '20000000', dueDate: '2026-12-12', counterpartyId: 'c1', bankCode: 'garanti', voice: '1' }
);
assert.equal('assetId' in chequeRoute.params, false);
assert.equal(voiceDraftRoute(fuel).pathname, '/transactions/new');
assert.equal(voiceDraftRoute(fuel).params.categoryId, 'k1');
assert.equal(voiceDraftRoute(twin).pathname, '/payments/new');
assert.equal(voiceDraftRoute(twin).params.date, '2026-11-09');
assert.equal(voiceDraftRoute(draft({ kind: 'unsupported' })), null);

// Kredi/kart borcu ödemesi yanlış ekrana gitmez
const debtPayment = draft({ kind: 'payment', direction: 'payable', amountMinor: 100, counterparty: 'Yapı Kredi', settlesBankDebt: true });
assert.equal(debtPayment.kind, 'unsupported');
assert.equal(nextVoiceQuestion(debtPayment, context, [], 'tr'), null);
assert.match(voiceAcknowledgement(debtPayment, 'tr'), /kart/);
assert.match(voiceAcknowledgement(debtPayment, 'en'), /card/);
assert.equal(voiceDraftRoute(debtPayment), null);

// Transfer
const transfer = draft({ kind: 'transaction', direction: 'transfer', amountMinor: 2000000, transcript: 'sigorta hesabıma aktardım' });
assert.equal(transfer.direction, 'transfer');
assert.equal(nextVoiceQuestion(transfer, context, [], 'tr'), null);
assert.equal(voiceDraftRoute(transfer).params.direction, 'transfer');

// Hesaplar arası transfer
const accountContext = { ...context, accounts: [{ id: 'h1', name: 'Nakit', currency_code: 'TRY' }, { id: 'h2', name: 'En Para', currency_code: 'TRY' }, { id: 'h3', name: 'Euro Hesap', currency_code: 'EUR' }] };
const movement = (raw) => normalizeVoiceDraft({ transcript: 'x', lowConfidence: [], kind: 'transaction', direction: 'transfer', amountMinor: 55000, ...raw }, accountContext);
const both = movement({ fromAccount: 'Nakit', toAccount: 'En Para' });
assert.equal(both.accountId, 'h1');
assert.equal(both.transferToAccountId, 'h2');
assert.equal(nextVoiceQuestion(both, accountContext, [], 'tr'), null);
assert.equal(voiceDraftRoute(both).params.accountId, 'h1');
assert.equal(voiceDraftRoute(both).params.transferToAccountId, 'h2');
assert.equal(movement({ fromAccount: 'Nakit', toAccount: 'Euro Hesap' }).transferToAccountId, null, 'farklı birime transfer doldurulmaz');
assert.equal(movement({ fromAccount: 'Nakit', toAccount: 'Nakit' }).transferToAccountId, null);
assert.equal(movement({ fromAccount: 'Uydurma' }).accountId, null);
const noSource = movement({ toAccount: 'En Para' });
const sourceQuestion = nextVoiceQuestion(noSource, accountContext, [], 'tr');
assert.equal(sourceQuestion.field, 'fromAccount');
assert.equal(sourceQuestion.options.some((o) => o.value === 'h2'), false);
const withSource = applyChipAnswer(noSource, accountContext, 'fromAccount', 'h1');
assert.equal(withSource.accountId, 'h1');
const noTarget = movement({ fromAccount: 'Nakit' });
assert.deepEqual(nextVoiceQuestion(noTarget, accountContext, [], 'en').options.map((o) => o.value), ['h2']);
assert.equal(applyChipAnswer(noTarget, accountContext, 'toAccount', 'yabanci').transferToAccountId, null);

// Yabancı para hareket ve ödemede TL tutarı olarak doldurulmaz
const euroSpend = draft({ kind: 'transaction', direction: 'expense', amountMinor: 200000, currency: 'EUR' });
assert.equal(isForeignAmountWithheld(euroSpend), true);
assert.equal('amountMinor' in voiceDraftRoute(euroSpend).params, false);
assert.equal('amountMinor' in voiceDraftRoute(draft({ kind: 'payment', direction: 'payable', amountMinor: 1, currency: 'USD' })).params, false);
assert.equal('amountMinor' in voiceDraftRoute(draft({ kind: 'obligation', documentType: 'borc_verme', direction: 'receivable', amountMinor: 1, currency: 'USD' })).params, false);
const euroInvoice = voiceDraftRoute(draft({ kind: 'obligation', documentType: 'fatura', direction: 'receivable', amountMinor: 200000, currency: 'EUR' }));
assert.equal(euroInvoice.params.amountMinor, '200000');
assert.equal(euroInvoice.params.currency, 'EUR');

// Kredide banka cari sayılmaz
const bankLoan = draft({ kind: 'obligation', documentType: 'kredi', direction: 'payable', amountMinor: 1, counterparty: 'İş Bankası' });
assert.equal(bankLoan.bank, 'İş Bankası');
assert.equal(bankLoan.counterpartyName, null);
assert.equal(bankLoan.counterpartyId, null);
const namedLoan = draft({ kind: 'obligation', documentType: 'kredi', direction: 'payable', amountMinor: 1, bank: 'Garanti', counterparty: 'İş Bankası' });
assert.equal(namedLoan.bank, 'Garanti');

// İngilizce
assert.equal(nextVoiceQuestion(bill, context, [], 'en').prompt, 'What is the amount? Tell me and I will add it.');
assert.equal(voiceAcknowledgement(cheque, 'en'), 'OK, processing the cheque.');
assert.equal(nextVoiceQuestion(draft({ kind: 'transaction', direction: 'expense', amountMinor: 1, transcript: 'I bought fuel' }), context, [], 'en').field, 'asset');
assert.equal(nextVoiceQuestion(draft({ kind: 'obligation', documentType: 'kira', direction: 'payable', amountMinor: 1, date: '2026-12-05', transcript: 'shop rent' }), context, [], 'en').options[0].value, 'a2');
assert.equal(nextVoiceQuestion(noDirection, context, [], 'en').options[0].label, 'I will pay');

console.log('voice-intake: ok');
