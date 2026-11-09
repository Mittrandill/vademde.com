// OCR'daki tarafların yöne ve cariye çevrilmesi. Gerekli: Node 22.18+.
import assert from 'node:assert/strict';
import { isOwnName, resolveDocumentParties } from '../supabase/functions/_shared/documentParties.ts';

const own = ['Mavi Lojistik A.Ş.', 'Selma Aydın'];

// Ad eşleştirme
assert.equal(isOwnName('MAVİ LOJİSTİK ANONİM ŞİRKETİ', own), true);
assert.equal(isOwnName('Mavi Lojistik Taşımacılık Ltd. Şti.', own), true);
assert.equal(isOwnName('selma aydın', own), true);
assert.equal(isOwnName('Selma Yılmaz', own), false);
assert.equal(isOwnName('Mavi Gıda', own), false);
assert.equal(isOwnName('Ahmet Demir', ['Ahmet']), false, 'tek kelimelik ad başkasıyla eşleşmemeli');
assert.equal(isOwnName('Ahmet', ['Ahmet']), true);
assert.equal(isOwnName('', own), false);
assert.equal(isOwnName('A.Ş.', own), false);

const cheque = (payerName, payeeName, extra = {}) => ({
  documentType: 'cek',
  direction: 'receivable',
  counterpartyName: 'Modelin Seçimi',
  instrumentDetails: { payerName, payeeName },
  ...extra,
});

// Çek: kendi yazdığımız çek
assert.deepEqual(resolveDocumentParties(cheque('Mavi Lojistik A.Ş.', 'Kaya İnşaat'), own), {
  direction: 'payable', counterpartyName: 'Kaya İnşaat', warning: null,
});
// Çek: bize yazılan çek
assert.deepEqual(resolveDocumentParties(cheque('Delta Hırdavat', 'Mavi Lojistik', { direction: 'payable' }), own), {
  direction: 'receivable', counterpartyName: 'Delta Hırdavat', warning: null,
});
// Çek: ciro edilmiş, üçüncü kişi adına
const endorsed = resolveDocumentParties(cheque('Aslan Tekstil', 'Mert Yılmaz', { direction: 'payable' }), own);
assert.equal(endorsed.direction, 'receivable');
assert.equal(endorsed.counterpartyName, 'Aslan Tekstil');
assert.match(endorsed.warning.tr, /Mert Yılmaz/);
assert.match(endorsed.warning.en, /Mert Yılmaz/);
// Lehtar okunamadıysa ciro uyarısı verilmez
assert.equal(resolveDocumentParties(cheque('Aslan Tekstil', null), own).warning, null);
// Keşideci okunamadıysa ve bizimle eşleşmiyorsa model sonucu korunur
assert.deepEqual(resolveDocumentParties(cheque(null, 'Mert Yılmaz'), own), {
  direction: 'receivable', counterpartyName: 'Modelin Seçimi', warning: null,
});
// Kendi adımız okunduysa ama karşı taraf okunamadıysa modelin adı korunur
assert.equal(resolveDocumentParties(cheque('Mavi Lojistik', null), own).counterpartyName, 'Modelin Seçimi');
assert.equal(resolveDocumentParties(cheque('Mavi Lojistik', null), own).direction, 'payable');
// İki taraf da bizse karar verilmez
assert.equal(resolveDocumentParties(cheque('Mavi Lojistik', 'Selma Aydın'), own).counterpartyName, 'Modelin Seçimi');

// Ad bilinmiyorsa hiçbir şey değişmez
for (const names of [[], [null, '  '], ['A.Ş.']]) {
  assert.deepEqual(resolveDocumentParties(cheque('Mavi', 'Kaya'), names), {
    direction: 'receivable', counterpartyName: 'Modelin Seçimi', warning: null,
  });
}

// Senet: ciro uyarısı yok
assert.deepEqual(resolveDocumentParties({ documentType: 'senet', direction: 'receivable', counterpartyName: 'x', instrumentDetails: { payerName: 'Selma Aydın', payeeName: 'Yeşil Oto' } }, own), {
  direction: 'payable', counterpartyName: 'Yeşil Oto', warning: null,
});
assert.equal(resolveDocumentParties({ documentType: 'senet', direction: 'payable', counterpartyName: 'x', instrumentDetails: { payerName: 'Burak Çelik', payeeName: 'Ayla Şahin' } }, own).warning, null);

const invoice = (sellerName, buyerName, direction = 'payable') => ({
  documentType: 'fatura', direction, counterpartyName: sellerName, invoiceDetails: { sellerName, buyerName },
});
// Fatura: satış
assert.deepEqual(resolveDocumentParties(invoice('Mavi Lojistik A.Ş.', 'Güneş Gıda'), own), {
  direction: 'receivable', counterpartyName: 'Güneş Gıda', warning: null,
});
assert.equal(resolveDocumentParties(invoice('Mavi Lojistik', 'Güneş Gıda', 'income'), own).direction, 'income');
// Fatura: alış
assert.deepEqual(resolveDocumentParties(invoice('Atlas Yapı', 'Mavi Lojistik', 'receivable'), own), {
  direction: 'payable', counterpartyName: 'Atlas Yapı', warning: null,
});
assert.equal(resolveDocumentParties(invoice('Atlas Yapı', 'Mavi Lojistik', 'expense'), own).direction, 'expense');
// Fatura: bizimle ilgisi görünmüyor
assert.equal(resolveDocumentParties(invoice('Atlas Yapı', 'Başka Firma', 'payable'), own).counterpartyName, 'Atlas Yapı');

const transfer = (senderName, recipientName) => ({
  documentType: 'banka_dekontu', direction: 'expense', counterpartyName: 'x', receiptDetails: { senderName, recipientName },
});
assert.deepEqual(resolveDocumentParties(transfer('Mavi Lojistik', 'Atlas Yapı'), own), { direction: 'expense', counterpartyName: 'Atlas Yapı', warning: null });
assert.deepEqual(resolveDocumentParties(transfer('Hakan Polat', 'Selma Aydın'), own), { direction: 'income', counterpartyName: 'Hakan Polat', warning: null });
assert.equal(resolveDocumentParties(transfer('Mavi Lojistik', 'Selma Aydın'), own).direction, 'transfer');
assert.equal(resolveDocumentParties(transfer('Hakan Polat', 'Atlas Yapı'), own).counterpartyName, 'x');

// Kredi, ekstre ve fişe dokunulmaz
for (const documentType of ['kredi', 'kredi_karti_ekstresi', 'makbuz_fis']) {
  assert.deepEqual(resolveDocumentParties({ documentType, direction: 'payable', counterpartyName: 'Mavi Lojistik' }, own), {
    direction: 'payable', counterpartyName: 'Mavi Lojistik', warning: null,
  });
}

console.log('document-parties: ok');
