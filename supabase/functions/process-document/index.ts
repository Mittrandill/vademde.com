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
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

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
    directionConfidence: { type: 'NUMBER' },
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
    suggestedCategory: { type: 'STRING', nullable: true },
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
            },
            required: ['date', 'description', 'amount'],
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

Belge türüne özel kurallar:
- documentType "kredi" ise installmentPlan alanını doldur: her taksit satırı için vade, anapara, faiz, vergi, taksit tutarı ve kalan anapara. installmentPlan.totalRepayment toplam geri ödemedir, totalAmount kredi anaparasıdır.
- documentType "kredi_karti_ekstresi" ise cardStatement alanını doldur: dönem borcu totalAmount'a, asgari ödeme minimumPayment'a yazılır; işlem satırlarını transactions dizisine ekle. Ekstrelerde tutarlar sık sık binlik ayıraçlı yazılır ("1.250,75") — ayıraçları ondalık sanma. dueDate ekstrenin SON ÖDEME TARİHİDİR (kesim/ekstre tarihi değil) — bu tarih, uygulamanın hangi ayın ekstresi olduğunu otomatik belirlemesi için kullanılır, bu yüzden doğru tarih alanının seçilmesi kritiktir; kesim tarihiyle karıştırma. Kesim tarihi varsa (statementDate alanı) onu cardStatement.statementDate'e yaz.
- documentType "fatura" ise invoiceDetails ve lineItems alanlarını doldur.
- documentType "makbuz_fis" ise lineItems alanını doldur (varsa).
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

interface LineItemRow {
  workspace_id: string;
  document_id: string;
  kind: 'line_item' | 'installment' | 'card_transaction';
  sort_order: number;
  description: string | null;
  occurred_at: string | null;
  quantity: number | null;
  unit_price_minor: number | null;
  tax_minor: number | null;
  amount_minor: number;
  remaining_minor: number | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Yetkilendirme başlığı eksik' }), { status: 401 });
  }

  const { documentId } = (await req.json()) as ProcessRequest;
  if (!documentId) {
    return new Response(JSON.stringify({ error: 'documentId zorunlu' }), { status: 400 });
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
    return new Response(JSON.stringify({ error: 'Belge bulunamadı veya erişim yok' }), { status: 404 });
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
    return new Response(JSON.stringify({ error: 'Çalışma alanı bulunamadı' }), { status: 404 });
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
    return new Response(JSON.stringify({ error: 'Plan limitleri okunamadı' }), { status: 500 });
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
      { status: 402, headers: { 'Content-Type': 'application/json' } }
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

  try {
    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from('financial-documents')
      .download(document.storage_path);
    if (downloadError || !fileBlob) throw new Error(`Belge indirilemedi: ${downloadError?.message}`);

    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: document.mime_type, data: base64 } },
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

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API hatası: ${geminiResponse.status} ${await geminiResponse.text()}`);
    }

    const geminiJson = await geminiResponse.json();
    const outputText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!outputText) throw new Error('Gemini yanıtı boş');

    const parsed = JSON.parse(outputText);

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
      model: GEMINI_MODEL,
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
        lineItemRows.push({
          workspace_id: document.workspace_id,
          document_id: documentId,
          kind: 'card_transaction',
          sort_order: index,
          description: (item.description as string) ?? null,
          occurred_at: (item.date as string) ?? null,
          quantity: null,
          unit_price_minor: null,
          tax_minor: null,
          amount_minor: amountMinor,
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

    return new Response(JSON.stringify({ success: true, documentId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';

    await adminClient.from('financial_documents').update({ status: 'failed' }).eq('id', documentId);
    await adminClient
      .from('document_processing_jobs')
      .update({ status: 'failed', last_error: message, completed_at: new Date().toISOString() })
      .eq('document_id', documentId)
      .eq('status', 'processing');

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
