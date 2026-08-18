// docs/04-ocr-belge-isleme.md — belge sınıflandırma ve alan çıkarımı.
// §7.1-7.9 belge türüne özel derin alanlar (kredi taksit tablosu, kart ekstresi
// işlemleri, fatura/makbuz satırları) ve §7.10 ortak yapılandırılmış çıktı birlikte.
// docs/06-teknik-mimari.md §10.3 — Gemini API anahtarı istemcide bulunmaz,
// OCR işi bu Edge Function üzerinden yürütülür.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
// gemini-2.5-flash, gemini-3.5-flash'a göre ~4-4.5x daha ucuz (input $0.30 vs $1.50,
// output $2.50 vs $9.00 / 1M token) ve responseSchema zorlaması sayesinde çoğu belgede
// yeterli. gemini-3.5-flash-lite aynı fiyatla A/B test edilebilir — bu env var'ı
// değiştirmek yeterli, kod değişikliği gerekmez.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
// Primary model katı bir hatayla (bozuk JSON, boş çıktı, HTTP hatası) başarısız olursa
// tek seferlik denenir. Yalnızca gerçekten zor/sorunlu belgelerde tetiklenmesi beklenir;
// tetiklenme oranı document_extractions.model üzerinden izlenmelidir.
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-3.5-flash';

// Gemini inline_data ile gönderilen istek toplam ~20 MB ile sınırlıdır; base64 ham dosyayı
// ~%33 şişirir, ayrıca prompt + şema da yer kaplar. Çok sayfalı ekstre bu sınırı aşınca
// Gemini 4xx döndürüp belgeyi 'failed' yapıyordu; bunun yerine kullanıcıya net mesaj verilir.
const MAX_INLINE_FILE_BYTES = 14 * 1024 * 1024;

// Gemini çağrısı yanıtsız kalırsa arka plan görevi süresiz asılı kalmasın diye üst sınır.
// Fallback devreye girerse en kötü ihtimalle iki sıralı çağrı (≤240sn) yapılır; proje
// Supabase Pro+ planda olduğundan (400sn wall-clock) bu, kalan DB yazma işlemleri için
// yeterli pay bırakarak sığar. Free plana (150sn) geri dönülürse bu değer düşürülmeli.
const GEMINI_TIMEOUT_MS = 120_000;

// CORS: react-native-web istemcisi preflight (OPTIONS) gönderir; native istemci göndermez.
// Bu başlıklar olmadan OPTIONS 405 dönüyordu (bkz. edge loglarında OPTIONS|405).
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DOCUMENT_TYPES = [
  'kredi', 'kredi_karti_ekstresi', 'cek', 'senet', 'fatura', 'abonelik', 'kira',
  'vergi_sgk', 'tedarikci_borcu', 'musteri_alacagi', 'banka_dekontu', 'makbuz_fis',
  'sozlesme_odeme_plani', 'diger',
];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    documentType: { type: 'STRING', enum: DOCUMENT_TYPES },
    documentTypeConfidence: { type: 'NUMBER' },
    direction: { type: 'STRING', enum: ['payable', 'receivable', 'income', 'expense', 'transfer'] },
    currency: { type: 'STRING' },
    // Tutarlar modelden ana birimde (TL) ondalık sayı olarak istenir, kuruşa çevirme işi
    // koda aittir — bkz. toMinor(). Modele "×100 yap" dedirtmek, Türkçe binlik ayıracıyla
    // birleşince 2.000,00 TL'yi 20.000 TL olarak yazdıran bir hata sınıfı üretiyordu.
    totalAmount: { type: 'NUMBER' },
    // Belgede yazdığı haliyle, ayıraçlarıyla birlikte ham metin ("2.000,00 TL"). Kod bunu
    // kendi ayrıştırıcısıyla çözüp modelin verdiği sayıyla karşılaştırır; ikisi tutmazsa
    // ham metinden çözülen değer esas alınır ve kullanıcıya uyarı düşülür.
    totalAmountRaw: { type: 'STRING', nullable: true },
    issueDate: { type: 'STRING', nullable: true },
    dueDate: { type: 'STRING', nullable: true },
    counterpartyName: { type: 'STRING', nullable: true },
    counterpartyTaxNumber: { type: 'STRING', nullable: true },
    counterpartyIban: { type: 'STRING', nullable: true },
    documentNumber: { type: 'STRING', nullable: true },
    // Model kategori ADI döner (id değil, model kategori id'lerini bilemez) — sistem bunu
    // workspace'in mevcut kategorileriyle eşleştirip suggested_category_id'yi doldurur
    // (bkz. aşağıdaki suggestedCategoryId eşleştirmesi, runProcessing içinde).
    suggestedCategory: { type: 'STRING', nullable: true },
    paymentMethod: {
      type: 'STRING',
      nullable: true,
      enum: ['nakit', 'kredi_karti', 'banka_karti', 'havale_eft', 'cek', 'bilinmiyor'],
    },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
    missingRequiredFields: { type: 'ARRAY', items: { type: 'STRING' } },
    fields: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          fieldName: { type: 'STRING' },
          rawValue: { type: 'STRING', nullable: true },
          normalizedValue: { type: 'STRING', nullable: true },
          confidence: { type: 'NUMBER' },
        },
        required: ['fieldName', 'confidence'],
      },
    },
    // docs §7.3 — yalnızca documentType "kredi" olduğunda doldurulur.
    installmentPlan: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        bankName: { type: 'STRING', nullable: true },
        loanType: { type: 'STRING', nullable: true },
        totalRepayment: { type: 'NUMBER', nullable: true },
        installmentCount: { type: 'INTEGER', nullable: true },
        interestRatePercent: { type: 'NUMBER', nullable: true },
        installments: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              installmentNumber: { type: 'INTEGER' },
              dueDate: { type: 'STRING' },
              principal: { type: 'NUMBER', nullable: true },
              interest: { type: 'NUMBER', nullable: true },
              tax: { type: 'NUMBER', nullable: true },
              installmentAmount: { type: 'NUMBER' },
              remainingPrincipal: { type: 'NUMBER', nullable: true },
            },
            required: ['installmentNumber', 'dueDate', 'installmentAmount'],
          },
        },
      },
    },
    // docs §7.4 — yalnızca documentType "kredi_karti_ekstresi" olduğunda doldurulur.
    cardStatement: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        bankName: { type: 'STRING', nullable: true },
        cardLastFourDigits: { type: 'STRING', nullable: true },
        statementDate: { type: 'STRING', nullable: true },
        minimumPayment: { type: 'NUMBER', nullable: true },
        previousDebt: { type: 'NUMBER', nullable: true },
        totalSpending: { type: 'NUMBER', nullable: true },
        transactions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              description: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              transactionType: {
                type: 'STRING',
                enum: ['purchase', 'payment', 'refund', 'fee', 'interest', 'cash_advance', 'unknown'],
              },
            },
            required: ['date', 'description', 'amount', 'transactionType'],
          },
        },
      },
    },
    // docs §7.5/§7.8 — fatura ve makbuz/fiş satırları.
    lineItems: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unitPrice: { type: 'NUMBER', nullable: true },
          taxRatePercent: { type: 'NUMBER', nullable: true },
          lineTotal: { type: 'NUMBER' },
        },
        required: ['description', 'lineTotal'],
      },
    },
    // docs §7.5 — fatura özel alanları.
    invoiceDetails: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        invoiceNumber: { type: 'STRING', nullable: true },
        ettn: { type: 'STRING', nullable: true },
        sellerName: { type: 'STRING', nullable: true },
        sellerTaxNumber: { type: 'STRING', nullable: true },
        buyerName: { type: 'STRING', nullable: true },
        buyerTaxNumber: { type: 'STRING', nullable: true },
        subtotal: { type: 'NUMBER', nullable: true },
        vatTotal: { type: 'NUMBER', nullable: true },
        discount: { type: 'NUMBER', nullable: true },
        grandTotal: { type: 'NUMBER', nullable: true },
      },
    },
  },
  required: [
    'documentType', 'documentTypeConfidence', 'direction', 'totalAmount',
    'fields', 'warnings', 'missingRequiredFields',
  ],
};

const PROMPT = `Bu görsel bir finansal belgedir (çek, senet, fatura, makbuz, dekont, kredi ödeme planı, kredi kartı ekstresi, abonelik faturası veya benzeri).
Görevin belgeyi sınıflandırıp aşağıdaki şemaya uygun yapılandırılmış JSON döndürmek.

Genel kurallar:
- TUTARLAR EN KRİTİK ALANDIR. Tüm tutar alanlarını belgenin ANA para biriminde (TL, kuruş değil) ondalık sayı olarak döndür. Kuruşa çevirme, 100 ile çarpma gibi bir işlem YAPMA; bunu sistem kendisi yapar.
- Türkçe finansal belgelerde binlik ayıracı nokta, ondalık ayıracı virgüldür. "2.000,00 TL" iki bin TL demektir -> 2000.00 döndür (20000 veya 200000 DEĞİL). "185.000,00 TL" -> 185000.00. "1.234,56" -> 1234.56.
- JSON çıktısında sayıları daima nokta ondalık ayıracıyla ve binlik ayıracı olmadan yaz.
- totalAmountRaw alanına, toplam tutarı belgede yazdığı haliyle, hiçbir şey değiştirmeden karakteri karakterine kopyala (ör. "2.000,00 TL"). Sistem bu ham metni kendi ayrıştırıcısıyla çözüp senin verdiğin sayıyla karşılaştırır; bu yüzden ham metnin birebir doğru olması, tahmin edilmemesi gerekir. Belgede net bir toplam yoksa null bırak.
- Bir tutarı okuyamıyor veya emin olamıyorsan uydurma; ilgili alanı null bırak ve missingRequiredFields'a ekle.
- Çek veya senet belgesinde rakamla ve yazıyla tutar birbirini tutmuyorsa warnings dizisine "Rakamla ve yazıyla tutar uyuşmuyor" ekle.
- Tarihleri ISO 8601 (YYYY-MM-DD) formatında döndür; belge üzerinde yoksa null bırak.
- direction alanı için: ödeyecek taraf belirtilmişse veya belge bir borç niteliğindeyse "payable"; tahsil edilecekse "receivable"; belge zaten gerçekleşmiş bir gider ise "expense", gerçekleşmiş bir gelir ise "income"; hesaplar arası transfer ise "transfer".
- fields dizisine belgeden okuduğun her önemli alanı (banka, çek no, IBAN, hesap, imza notu vb.) fieldName/rawValue/normalizedValue/confidence olarak ekle. confidence 0-1 arası olmalı.
- Emin olmadığın veya belgede bulunmayan alanlar için confidence düşük olsun ve missingRequiredFields dizisine ekle.
- suggestedCategory alanına, belgenin niteliğine en uygun YAYGIN bir Türkçe kişisel/işletme finans kategori adı yaz — kategori id'si DEĞİL, tam kategori adı (sistem bunu mevcut kategorilerle eşleştirir). Örnekler: market/süpermarket fişi -> "Market"; restoran/kafe fişi -> "Restoran / Kafe"; akaryakıt -> "Yakıt"; eczane/hastane -> "Sağlık"; elektrik/su/doğalgaz/internet/telefon faturası -> "Faturalar"; giyim mağazası -> "Giyim & Aksesuar"; elektronik/teknoloji mağazası -> "Teknoloji & Elektronik"; kira ödemesi -> "Kira"; maaş bordrosu/gelir belgesi -> "Maaş". Belgenin niteliği bu örneklerin hiçbirine net biçimde uymuyorsa (ör. çek, senet, kredi, banka dekontu gibi kategoriden bağımsız türler) null bırak — uydurma isim yazma.
- paymentMethod alanına ödemenin nasıl yapıldığını/yapılacağını yaz: nakit ödendiyse "nakit" (fişte "NAKİT" yazması veya nakit tutarı/para üstü satırı gibi işaretler); kredi kartıyla ödendiyse "kredi_karti"; banka/debit kartıyla ödendiyse "banka_karti"; havale/EFT ile ödendiyse/ödenecekse "havale_eft"; çekle ödendiyse "cek"; belgede ödeme yöntemi hiç belirtilmemişse null bırak (bilinmiyor değerini yalnızca belgede birden fazla/belirsiz yöntem izi varsa kullan).

Belge türüne özel kurallar:
- documentType "cek" ise: ÇEKİ DÜZENLEYEN/İMZALAYAN/KAŞELEYEN taraf (hesap sahibi, "keşideci") ÖDEMEYİ YAPACAK taraftır — borçludur. "___ emrine ödeyiniz" ibaresinden SONRA EL YAZISIYLA yazılan isim ise ÖDEMEYİ ALACAK taraftır (lehtar/alacaklı) — bu iki ismi ASLA birbirine karıştırma. Belgeyi tarayan kullanıcı, fiziksel çek genellikle tahsil edecek kişide bulunduğu için varsayılan olarak LEHTAR (alacaklı) kabul edilir: direction'ı "receivable" yap ve counterpartyName alanına KEŞİDECİNİN adını (imza/kaşe/hesap sahibi bilgisi, "emrine"deki el yazısı isim DEĞİL) yaz. Belgede kullanıcının kendi imzası/kaşesi keşideci olarak görünüyorsa (yani kullanıcı çeki kendisi düzenlemişse) bunun yerine direction "payable", counterpartyName ise "emrine" kısmındaki lehtar adı olmalıdır — ama bu yalnızca kullanıcının kendi adı/işletmesi keşideci tarafında açıkça görünüyorsa geçerlidir, aksi halde varsayılan (receivable + keşideci adı) kullanılır. Kullanıcı yön ve tarafı onay ekranında düzeltebilir.
- documentType "senet" ise aynı ayrım geçerlidir: senedi İMZALAYAN taraf borçludur (ödeyecek), senette adı geçen alacaklı ise tahsil edecek taraftır. Aynı varsayım: tarayan kullanıcı genellikle alacaklıdır (direction "receivable"), counterpartyName borçlunun adıdır — kullanıcının kendisi borçlu tarafında açıkça görünmedikçe.
- documentType "kredi" ise installmentPlan alanını doldur: her taksit satırı için vade, anapara, faiz, vergi, taksit tutarı ve kalan anapara. installmentPlan.totalRepayment toplam geri ödemedir, totalAmount kredi anaparasıdır. Belgede krediyi veren bankanın adı geçiyorsa (logo, başlık, "... Bankası A.Ş." ibaresi vb.) bunu HEM installmentPlan.bankName HEM DE counterpartyName alanına, birebir aynı şekilde yaz — kredide "kişi/firma" tarafı zaten bankanın kendisidir, bu iki alan farklı bankalar veya biri dolu diğeri boş olacak şekilde ASLA tutarsız olmamalı.
- documentType "kredi_karti_ekstresi" ise cardStatement alanını doldur: dönem borcu totalAmount'a, asgari ödeme minimumPayment'a yazılır; işlem satırlarını transactions dizisine ekle. Her satıra transactionType ata: normal alışveriş "purchase"; "ÖDEME", "KART ÖDEMESİ", "TAHSİLAT", "ÖDEME - TEŞEKKÜRLER" benzeri geçmiş dönem borç kapatma satırları "payment"; işyeri/ürün iadesi "refund"; üyelik/yıllık kart/komisyon/BSMV gibi ücretler "fee"; akdi/gecikme faizi "interest"; nakit çekim/avans "cash_advance"; güvenle ayıramadığın satır "unknown". Ödeme ve iadeleri ASLA purchase olarak sınıflandırma. Satır amount değerlerini işaret kullanmadan pozitif sayı döndür; yön transactionType ile belirlenir. Ekstrelerde tutarlar sık sık binlik ayıraçlı yazılır ("1.250,75") — ayıraçları ondalık sanma. dueDate ekstrenin SON ÖDEME TARİHİDİR (kesim/ekstre tarihi değil) — bu tarih, uygulamanın hangi ayın ekstresi olduğunu otomatik belirlemesi için kullanılır, bu yüzden doğru tarih alanının seçilmesi kritiktir; kesim tarihiyle karıştırma. Kesim tarihi varsa (statementDate alanı) onu cardStatement.statementDate'e yaz. Ekstreyi veren bankanın adını HEM cardStatement.bankName HEM DE counterpartyName alanına, birebir aynı şekilde yaz (kredi kartı ekstresinde de "kişi/firma" tarafı bankadır).
- documentType "fatura" ise invoiceDetails ve lineItems alanlarını doldur; counterpartyName alanına SATICI (invoiceDetails.sellerName ile birebir aynı) adını yaz — alıcı değil.
- documentType "makbuz_fis" ise lineItems alanını doldur (varsa); counterpartyName alanına fişi/makbuzu düzenleyen İŞLETMENİN (market, mağaza, restoran vb. — fişin başlığında/kaşesinde geçen ad) adını yaz, alıcı/müşteri değil.
- Diğer türlerde installmentPlan, cardStatement, lineItems, invoiceDetails alanlarını null/boş bırak.
- Yalnızca şemaya uyan JSON döndür, başka açıklama ekleme.`;

interface ProcessRequest {
  documentId: string;
}

// Modelden gelen ana birim (TL) ondalık tutarı kuruşa çevirir. Bu dönüşüm bilinçli olarak
// modelde değil burada yapılır — bkz. PROMPT ve RESPONSE_SCHEMA notları.
function toMinor(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Belgede yazdığı haliyle kopyalanan ham tutar metnini kuruşa çevirir. Türkçe yazımda
// binlik ayıracı "." ondalık ayıracı ","dır ("2.000,00"); İngilizce belgelerde tersi
// olabilir, bu yüzden sonda gelen ayıraç ondalık kabul edilir. Mantık utils/money.ts
// içindeki parseAmount ile aynıdır; Edge Function ayrı bir Deno bundle'ı olduğundan
// paylaşılmak yerine burada tekrarlanır.
function parseAmountTextToMinor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = cleaned.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.');
  } else if (lastDot >= 0) {
    // Yalnızca nokta belirsiz: son noktadan sonra tam 3 hane varsa binlik ayıracıdır
    // ("2.000" -> 2000), aksi halde ondalıktır ("12.50" -> 12.5).
    normalized = cleaned.length - lastDot - 1 === 3 ? cleaned.split('.').join('') : cleaned;
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

// Büyük dosyalarda String.fromCharCode(...bytes) çağrı yığınını taşırdığı için
// parça parça (chunk) işlenir.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Tek bir Gemini generateContent çağrısını yürütür; timeout, HTTP hata, boş çıktı ve
// bozuk JSON durumlarında fırlatır. runProcessing bunu önce primary sonra (gerekirse)
// fallback modeliyle çağırır — bkz. GEMINI_FALLBACK_MODEL notu yukarıda.
async function callGemini(model: string, mimeType: string, base64Data: string): Promise<any> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      throw new Error('Belge analizi zaman aşımına uğradı. Lütfen tekrar deneyin veya daha küçük bir belge yükleyin.');
    }
    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!geminiResponse.ok) {
    throw new Error(`Gemini API hatası: ${geminiResponse.status} ${await geminiResponse.text()}`);
  }

  const geminiJson = await geminiResponse.json();
  const outputText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!outputText) throw new Error('Gemini yanıtı boş');

  try {
    return JSON.parse(outputText);
  } catch {
    // Model bazen (özellikle uzun ekstrelerde MAX_TOKENS ile kesilince) geçersiz/yarım JSON
    // döndürebiliyor; korumasız JSON.parse burada throw edip belgeyi genel 500 ile bozuyordu.
    throw new Error('Belge okunamadı: analiz sonucu beklenen biçimde değil. Lütfen tekrar deneyin.');
  }
}

interface LineItemRow {
  workspace_id: string;
  document_id: string;
  kind:
    | 'line_item'
    | 'installment'
    | 'card_transaction'
    | 'card_purchase'
    | 'card_payment'
    | 'card_refund'
    | 'card_fee'
    | 'card_interest'
    | 'card_cash_advance'
    | 'card_unknown';
  sort_order: number;
  description: string | null;
  occurred_at: string | null;
  quantity: number | null;
  unit_price_minor: number | null;
  tax_minor: number | null;
  amount_minor: number;
  remaining_minor: number | null;
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Yetkilendirme başlığı eksik' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const { documentId } = (await req.json()) as ProcessRequest;
  if (!documentId) {
    return new Response(JSON.stringify({ error: 'documentId zorunlu' }), { status: 400, headers: jsonHeaders });
  }

  // Çağıranın bu belgeye erişimi olup olmadığını RLS ile doğrula (anon key + kullanıcı JWT).
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: document, error: documentError } = await authedClient
    .from('financial_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (documentError || !document) {
    return new Response(JSON.stringify({ error: 'Belge bulunamadı veya erişim yok' }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  // Depolama ve yazma işlemleri için service role (RLS'yi atlar, yalnızca sunucu tarafında).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // docs/10-abonelik-gelir-modeli.md §14.1 — aylık OCR kotası owner (workspace sahibi)
  // bazında tutulur; kota dolduğunda Gemini hiç çağrılmaz.
  const { data: workspace, error: workspaceError } = await adminClient
    .from('workspaces')
    .select('owner_id')
    .eq('id', document.workspace_id)
    .single();
  if (workspaceError || !workspace) {
    return new Response(JSON.stringify({ error: 'Çalışma alanı bulunamadı' }), { status: 404, headers: jsonHeaders });
  }
  const ownerId = workspace.owner_id;
  const periodMonth = new Date();
  const periodMonthIso = new Date(
    Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const { data: subscription } = await adminClient
    .from('subscriptions')
    .select('plan')
    .eq('owner_id', ownerId)
    .maybeSingle();
  const plan = subscription?.plan ?? 'free';

  const { data: planLimits, error: planLimitsError } = await adminClient
    .from('plan_limits')
    .select('monthly_ocr_quota')
    .eq('plan', plan)
    .single();
  if (planLimitsError || !planLimits) {
    return new Response(JSON.stringify({ error: 'Plan limitleri okunamadı' }), { status: 500, headers: jsonHeaders });
  }

  const { data: usage } = await adminClient
    .from('ocr_usage')
    .select('used_count')
    .eq('owner_id', ownerId)
    .eq('period_month', periodMonthIso)
    .maybeSingle();
  const usedCount = usage?.used_count ?? 0;

  if (usedCount >= planLimits.monthly_ocr_quota) {
    return new Response(
      JSON.stringify({ error: 'Aylık OCR kotanız doldu', quotaExceeded: true }),
      { status: 402, headers: jsonHeaders }
    );
  }

  await adminClient
    .from('document_processing_jobs')
    .insert({
      workspace_id: document.workspace_id,
      document_id: documentId,
      status: 'processing',
      started_at: new Date().toISOString(),
    });
  await adminClient.from('financial_documents').update({ status: 'processing' }).eq('id', documentId);

  // İstemciyi 13-74 sn sürebilen Gemini çağrısından ayırıyoruz: ağır iş (indir → Gemini →
  // ayrıştır → yaz) EdgeRuntime.waitUntil ile arka planda çalışır, handler hemen 202 döner.
  // İstemci zaten belge status'ünü poll ediyor (app/(tabs)/tara.tsx documentQuery), bu yüzden
  // fonksiyonun tam yanıtını beklemesine gerek yok — böylece mobil tarafta uzun bekleme/zaman
  // aşımı kaynaklı "boş dönme/çökme" ortadan kalkar. Hata durumunda status='failed' + job
  // last_error yazılır ve istemci bunu poll ile görür.
  // docs/07-guvenlik-gizlilik.md §11.3 — kullanıcı "işlem sonrası sakla"yı kapattıysa
  // (retain_original=false) ham belge artık gerekmez; Gemini analizini bitirdiğimiz an
  // (başarılı ya da başarısız fark etmez) siliniyor — kullanıcının onay ekranını
  // bitirmesini beklemek gibi belirsiz bir süre boyunca (terk edilirse süresiz) hassas
  // finansal belgeyi bucket'ta bekletmemek için. Başarılı akışta silme tamamlanmadan
  // belge ready_for_review yapılmaz; böylece istemci silme ile yarışıp artık saklanmaması
  // gereken dosya için imzalı URL alamaz.
  async function deleteOriginalIfNotRetained(): Promise<void> {
    if (document.retain_original !== false) return;

    const { error } = await adminClient.storage
      .from('financial-documents')
      .remove([document.storage_path]);

    if (error) {
      throw new Error(`Ham belge silinemedi: ${error.message}`);
    }
  }

  // Ana işlem zaten hata verdiyse temizlik hatası asıl hatayı gölgelememeli. Yine de
  // Storage istemcisinin döndürdüğü error açıkça kontrol edilir ve sunucu logunda görünür.
  async function deleteOriginalBestEffort(): Promise<void> {
    try {
      await deleteOriginalIfNotRetained();
    } catch (error) {
      console.error(
        'Ham belge temizlenemedi',
        error instanceof Error ? error.message : 'Bilinmeyen Storage hatası'
      );
    }
  }

  const runProcessing = async () => {
   try {
    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from('financial-documents')
      .download(document.storage_path);
    if (downloadError || !fileBlob) throw new Error(`Belge indirilemedi: ${downloadError?.message}`);

    const arrayBuffer = await fileBlob.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_INLINE_FILE_BYTES) {
      throw new Error(
        'Belge çok büyük (14 MB üzeri). Lütfen daha düşük çözünürlükte tarayın veya çok sayfalı ekstreyi bölerek yükleyin.'
      );
    }
    const base64 = arrayBufferToBase64(arrayBuffer);

    // Önce ucuz primary model denenir; yalnızca katı bir hatayla (HTTP hatası, boş çıktı,
    // bozuk JSON) başarısız olursa tek seferlik pahalı fallback modeline geçilir. Düşük
    // confidence gibi "yumuşak" sinyaller bilinçli olarak tetikleyici değildir — bkz.
    // GEMINI_FALLBACK_MODEL notu.
    let parsed: any;
    let modelUsed = GEMINI_MODEL;
    try {
      parsed = await callGemini(GEMINI_MODEL, document.mime_type, base64);
    } catch (primaryError) {
      console.warn(
        `Primary model (${GEMINI_MODEL}) başarısız, fallback deneniyor (${GEMINI_FALLBACK_MODEL}):`,
        primaryError instanceof Error ? primaryError.message : primaryError
      );
      modelUsed = GEMINI_FALLBACK_MODEL;
      parsed = await callGemini(GEMINI_FALLBACK_MODEL, document.mime_type, base64);
    }

    // Toplam tutar iki bağımsız yoldan elde edilir: modelin verdiği ondalık sayı ve
    // belgeden birebir kopyalanan ham metnin kod tarafından ayrıştırılması. İkisi
    // tutmuyorsa deterministik olan (ham metin) esas alınır ve kullanıcı onay ekranında
    // görsün diye uyarı düşülür — docs/04-ocr-belge-isleme.md gereği düşük güvenli alan
    // işaretlenir, sessizce yanlış tutar yazılmaz.
    const warnings: string[] = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
    const modelTotalMinor = toMinor(parsed.totalAmount);
    const rawTotalMinor = parseAmountTextToMinor(parsed.totalAmountRaw);
    let totalAmountMinor = rawTotalMinor ?? modelTotalMinor ?? 0;
    let totalAmountConfidence: number | null = null;

    if (rawTotalMinor !== null && modelTotalMinor !== null && rawTotalMinor !== modelTotalMinor) {
      totalAmountMinor = rawTotalMinor;
      totalAmountConfidence = 0.4;
      warnings.push(
        `Tutar okuması belirsiz: belgede "${parsed.totalAmountRaw}" yazıyor. ` +
          `Kaydedilen tutar ${(rawTotalMinor / 100).toFixed(2)}; lütfen doğrulayın.`
      );
    }
    parsed.warnings = warnings;

    await adminClient.from('document_extractions').insert({
      workspace_id: document.workspace_id,
      document_id: documentId,
      provider: 'gemini',
      model: modelUsed,
      structured_output: parsed,
    });

    const fieldRows = (Array.isArray(parsed.fields) ? parsed.fields : []).map(
      (field: Record<string, unknown>) => ({
        workspace_id: document.workspace_id,
        document_id: documentId,
        field_name: field.fieldName,
        raw_value: field.rawValue ?? null,
        normalized_value: field.normalizedValue ?? null,
        confidence: field.confidence ?? null,
      })
    );

    // Tutar mutabakatı tutmadıysa onay ekranındaki "Kontrol et — düşük güven" uyarısı
    // TUTAR alanının yanında çıksın diye alan adı review.tsx'in aradığı 'totalAmount'
    // olarak yazılır; modelin kendi totalAmount satırı varsa onun güveni de düşürülür.
    if (totalAmountConfidence !== null) {
      const existing = fieldRows.find(
        (row: { field_name: unknown }) =>
          String(row.field_name).toLowerCase() === 'totalamount'
      );
      if (existing) {
        existing.confidence = totalAmountConfidence;
        existing.raw_value = parsed.totalAmountRaw ?? existing.raw_value;
      } else {
        fieldRows.push({
          workspace_id: document.workspace_id,
          document_id: documentId,
          field_name: 'totalAmount',
          raw_value: parsed.totalAmountRaw ?? null,
          normalized_value: (totalAmountMinor / 100).toFixed(2),
          confidence: totalAmountConfidence,
        });
      }
    }

    if (fieldRows.length > 0) {
      await adminClient.from('document_fields').insert(fieldRows);
    }

    const lineItemRows: LineItemRow[] = [];

    // Satır tutarları da modelden ana birimde gelir; kuruşa çevirme burada yapılır.
    // Çevrilemeyen (null/NaN) bir satır tutarı veritabanına 0 olarak yazılmaz — satır
    // tamamen atlanır, aksi halde kullanıcı onay ekranında sessizce 0,00 TL'lik bir
    // taksit/harcama görürdü.
    if (parsed.installmentPlan?.installments?.length) {
      parsed.installmentPlan.installments.forEach((item: Record<string, unknown>, index: number) => {
        const amountMinor = toMinor(item.installmentAmount);
        if (amountMinor === null) return;
        const interestMinor = toMinor(item.interest) ?? 0;
        const taxMinor = toMinor(item.tax) ?? 0;
        lineItemRows.push({
          workspace_id: document.workspace_id,
          document_id: documentId,
          kind: 'installment',
          sort_order: (item.installmentNumber as number) ?? index + 1,
          description: `Taksit ${item.installmentNumber ?? index + 1}`,
          occurred_at: (item.dueDate as string) ?? null,
          quantity: null,
          unit_price_minor: null,
          tax_minor: interestMinor + taxMinor || null,
          amount_minor: amountMinor,
          remaining_minor: toMinor(item.remainingPrincipal),
        });
      });
    }

    if (parsed.cardStatement?.transactions?.length) {
      parsed.cardStatement.transactions.forEach((item: Record<string, unknown>, index: number) => {
        const amountMinor = toMinor(item.amount);
        if (amountMinor === null) return;
        const transactionType = typeof item.transactionType === 'string' ? item.transactionType : 'unknown';
        const kindByType: Record<string, LineItemRow['kind']> = {
          purchase: 'card_purchase',
          payment: 'card_payment',
          refund: 'card_refund',
          fee: 'card_fee',
          interest: 'card_interest',
          cash_advance: 'card_cash_advance',
          unknown: 'card_unknown',
        };
        lineItemRows.push({
          workspace_id: document.workspace_id,
          document_id: documentId,
          kind: kindByType[transactionType] ?? 'card_unknown',
          sort_order: index,
          description: (item.description as string) ?? null,
          occurred_at: (item.date as string) ?? null,
          quantity: null,
          unit_price_minor: null,
          tax_minor: null,
          amount_minor: Math.abs(amountMinor),
          remaining_minor: null,
        });
      });
    }

    if (parsed.lineItems?.length) {
      parsed.lineItems.forEach((item: Record<string, unknown>, index: number) => {
        const amountMinor = toMinor(item.lineTotal);
        if (amountMinor === null) return;
        lineItemRows.push({
          workspace_id: document.workspace_id,
          document_id: documentId,
          kind: 'line_item',
          sort_order: index,
          description: (item.description as string) ?? null,
          occurred_at: null,
          quantity: (item.quantity as number) ?? null,
          unit_price_minor: toMinor(item.unitPrice),
          tax_minor: null,
          amount_minor: amountMinor,
          remaining_minor: null,
        });
      });
    }

    if (lineItemRows.length > 0) {
      await adminClient.from('document_line_items').insert(lineItemRows);
    }

    // extracted_summary'nin anahtarları bilinçli olarak "*Minor" kalır: istemci (bkz.
    // app/documents/[id]/review.tsx) bu adlarla okur ve değerler kuruş cinsindendir —
    // değişen yalnızca modelden hangi biçimde alındığıdır.
    const extractedSummary: Record<string, unknown> = {};
    if (parsed.installmentPlan) {
      extractedSummary.loan = {
        bankName: parsed.installmentPlan.bankName,
        loanType: parsed.installmentPlan.loanType,
        totalRepaymentMinor: toMinor(parsed.installmentPlan.totalRepayment),
        installmentCount: parsed.installmentPlan.installmentCount,
        interestRatePercent: parsed.installmentPlan.interestRatePercent,
      };
    }
    if (parsed.cardStatement) {
      extractedSummary.card = {
        bankName: parsed.cardStatement.bankName,
        cardLastFourDigits: parsed.cardStatement.cardLastFourDigits,
        statementDate: parsed.cardStatement.statementDate,
        minimumPaymentMinor: toMinor(parsed.cardStatement.minimumPayment),
        previousDebtMinor: toMinor(parsed.cardStatement.previousDebt),
        totalSpendingMinor: toMinor(parsed.cardStatement.totalSpending),
      };
    }
    if (parsed.invoiceDetails) {
      extractedSummary.invoice = {
        ...parsed.invoiceDetails,
        subtotalMinor: toMinor(parsed.invoiceDetails.subtotal),
        vatTotalMinor: toMinor(parsed.invoiceDetails.vatTotal),
        discountMinor: toMinor(parsed.invoiceDetails.discount),
        grandTotalMinor: toMinor(parsed.invoiceDetails.grandTotal),
      };
    }
    // review.tsx (bkz. paymentMethod tabanlı hesap eşleştirmesi) belge türünden bağımsız
    // olarak okur — bu yüzden loan/card/invoice gibi belge türüne özel bir alt nesneye değil,
    // extractedSummary'nin köküne yazılır.
    if (parsed.paymentMethod) {
      extractedSummary.paymentMethod = parsed.paymentMethod;
    }

    // Modelin serbest metin suggestedCategory'sini (bkz. PROMPT) workspace'in MEVCUT
    // kategorileriyle eşleştirir — id'yi bilemeyeceği için model yalnızca isim döner, eşleştirme
    // burada yapılır. Yalnızca var olan bir kategoriyle eşleşirse yazılır; yeni kategori burada
    // OLUŞTURULMAZ (aksi halde iptal edilen/hiç onaylanmayan taramalar bile kategori kirliliği
    // yaratırdı — bkz. aşağıdaki kişi/firma eşleştirmesiyle aynı ilke, review.tsx confirmMutation).
    let suggestedCategoryId: string | null = null;
    const categoryKind =
      parsed.direction === 'payable' || parsed.direction === 'expense'
        ? 'expense'
        : parsed.direction === 'receivable' || parsed.direction === 'income'
          ? 'income'
          : null;
    if (parsed.suggestedCategory && categoryKind) {
      const { data: categories } = await adminClient
        .from('categories')
        .select('id, name')
        .eq('workspace_id', document.workspace_id)
        .eq('kind', categoryKind);
      if (categories?.length) {
        const normalize = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
        const target = normalize(parsed.suggestedCategory);
        const exact = categories.find((c) => normalize(c.name) === target);
        const partial =
          exact ??
          categories.find((c) => {
            const normalizedName = normalize(c.name);
            return normalizedName.includes(target) || target.includes(normalizedName);
          });
        suggestedCategoryId = partial?.id ?? null;
      }
    }

    // Ham belge saklanmayacaksa önce Storage'dan kaldırılır. Bu tamamlanmadan durumun
    // ready_for_review olması, poll eden istemcinin silinmek üzere olan belgeyi açmasına
    // neden oluyordu.
    await deleteOriginalIfNotRetained();

    await adminClient
      .from('financial_documents')
      .update({
        status: 'ready_for_review',
        document_type: parsed.documentType,
        direction: parsed.direction,
        total_amount_minor: totalAmountMinor,
        currency_code: parsed.currency ?? 'TRY',
        issue_date: parsed.issueDate ?? null,
        due_date: parsed.dueDate ?? null,
        document_number: parsed.documentNumber ?? null,
        counterparty_name: parsed.counterpartyName ?? null,
        overall_confidence: parsed.documentTypeConfidence ?? null,
        extracted_summary: Object.keys(extractedSummary).length > 0 ? extractedSummary : null,
        suggested_category_id: suggestedCategoryId,
      })
      .eq('id', documentId);

    // Yalnızca başarılı taramada kota düşürülür (docs/10-abonelik-gelir-modeli.md §14.1) —
    // yukarıdaki her throw bu satıra ulaşmadan catch'e düşer, ocr_usage değişmez.
    await adminClient.rpc('increment_ocr_usage', {
      target_owner: ownerId,
      target_period: periodMonthIso,
    });

    await adminClient
      .from('document_processing_jobs')
      .update({ status: 'succeeded', completed_at: new Date().toISOString() })
      .eq('document_id', documentId)
      .eq('status', 'processing');

    // Buraya ulaşıldıysa ham belge tercihe göre temizlenmiş, belge 'ready_for_review' ve
    // job 'succeeded' olarak yazılmıştır; istemci poll ile inceleme ekranına geçebilir.
   } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';

    await adminClient.from('financial_documents').update({ status: 'failed' }).eq('id', documentId);
    await adminClient
      .from('document_processing_jobs')
      .update({ status: 'failed', last_error: message, completed_at: new Date().toISOString() })
      .eq('document_id', documentId)
      .eq('status', 'processing');
    await deleteOriginalBestEffort();
   }
  };

  // @ts-ignore Deno edge runtime global — yanıt gönderildikten sonra işi arka planda sürdürür.
  EdgeRuntime.waitUntil(runProcessing());

  return new Response(JSON.stringify({ accepted: true, documentId }), {
    status: 202,
    headers: jsonHeaders,
  });
});
