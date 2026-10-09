import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import type { Tables, TablesInsert, TablesUpdate } from '@/db/database.types';
import { installmentTotalMatches } from '@/utils/validation';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';

export type Obligation = Tables<'obligations'>;
export type Installment = Tables<'installments'>;

export type ObligationWithRelations = Obligation & {
  category: { name: string } | null;
  counterparty: { name: string } | null;
  account: { name: string } | null;
  // Bu borca/alacağa yapılmış ödemelerin gerçek tarihleri (payments.paid_at) — Hareketler'in
  // "Tümü" sekmesi, kısmen ödenen/tahsil edilen kayıtlarda vade tarihi yerine bu tarihi
  // gösterir (bkz. hareketler.tsx). Ödeme bir hesaptan yapılmamışsa (elden/nakit) ilişkili
  // bir transaction hiç oluşmaz, bu yüzden tarih doğrudan payments'tan okunur.
  payments?: { paid_at: string }[];
};

// Taksitli bir obligation'ın tek bir taksitini takvim/liste ekranlarında ObligationWithRelations
// gibi göstermek için kullanılır: due_date/total_amount_minor/remaining_amount_minor o taksite
// aittir, id ise gerçek obligation'ı gösterir (detay sayfasına gidiş için); installment_id/number
// hangi taksit olduğunu taşır (ödeme kaydında kullanılır).
export type ObligationDueItem = ObligationWithRelations & {
  installment_id?: string | null;
  installment_number?: number | null;
};

// docs/06-teknik-mimari.md §10.6.2 — sayfa boyutu 30, .range() ile ofset tabanlı sayfalama.
export const OBLIGATIONS_PAGE_SIZE = 30;

// docs/01-finansal-kayit-modeli.md §3.4 — 'odendi', 'tahsil_edildi' ve 'iptal_edildi'
// terminal durumlardır; dashboard'daki aktif borç/alacak widget'ları bunları hariç tutar.
export const ACTIVE_OBLIGATION_STATUSES: Obligation['status'][] = [
  'taslak',
  'inceleme_gerekli',
  'bekliyor',
  'kismen_odendi',
  'gecikti',
  'kismen_tahsil_edildi',
];

// docs/01-finansal-kayit-modeli.md §3.4 — terminal (kapanmış) durumlar.
export const CLOSED_OBLIGATION_STATUSES: Obligation['status'][] = ['odendi', 'tahsil_edildi', 'iptal_edildi'];

export interface ListObligationsFilter {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  /** docs/01-finansal-kayit-modeli.md §3.2 belge türü ('cek', 'senet', 'kredi'...). */
  documentType?: string;
  counterpartyId?: string;
  bankCode?: string;
  accountId?: string;
  statuses?: Obligation['status'][];
  dueFrom?: string;
  dueTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Yalnızca bu kayıtlar (gecikmiş filtresi: bkz. getOverdueObligationIds). Boş dizi → sonuç yok. */
  ids?: string[];
  /** Bu tarihten (YYYY-MM-DD) önce vadeli kayıtlar — gecikmiş filtresi için.
   * Durum alanı vade geçince otomatik 'gecikti' olmadığından gecikme tarihten türetilir. */
  dueBefore?: string;
  /** Vade tarihine göre sıralama yönü; varsayılan artan (en yakın vade önce). */
  ascending?: boolean;
}

export async function listObligations({
  workspaceId,
  direction,
  documentType,
  counterpartyId,
  bankCode,
  accountId,
  statuses,
  ids,
  dueFrom,
  dueTo,
  dueBefore,
  search,
  page = 0,
  pageSize = OBLIGATIONS_PAGE_SIZE,
  ascending = true,
}: ListObligationsFilter): Promise<ObligationWithRelations[]> {
  if (ids && ids.length === 0) return [];
  let query = supabase
    .from('obligations')
    .select('*, category:categories(name), counterparty:counterparties(name), account:accounts(name), payments(paid_at)')
    .eq('workspace_id', workspaceId);
  if (direction) query = query.eq('direction', direction);
  if (documentType) query = query.eq('document_type', documentType);
  if (counterpartyId) query = query.eq('counterparty_id', counterpartyId);
  if (bankCode) query = query.eq('bank_code', bankCode);
  if (accountId) query = query.eq('account_id', accountId);
  if (statuses?.length) query = query.in('status', statuses);
  if (ids) query = query.in('id', ids);
  if (dueFrom) query = query.gte('due_date', dueFrom);
  if (dueTo) query = query.lte('due_date', dueTo);
  if (dueBefore) query = query.lt('due_date', dueBefore);
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query = query.ilike('title', `%${trimmedSearch}%`);

  const { data, error } = await query
    .order('due_date', { ascending, nullsFirst: false })
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return data as unknown as ObligationWithRelations[];
}

// Gecikme ve "en yakın vade" bilgisi. obligations.due_date taksitli kayıtta İLK taksidin tarihidir ve
// taksitler ödendikçe ilerlemez; ona bakmak ilk taksidi ödenmiş her kredi/aboneliği gecikmiş ve
// "en yakın vadesi geçmişte" gösteriyordu. Ayrıca obligations.status hiçbir yerde otomatik 'gecikti'
// olmaz (veritabanında bu durumda kayıt yoktur), yani status'a bakan gecikme sayıları hep 0'dı.
// Taksitli kayıtta gecikme "vadesi geçmiş ve hâlâ açık taksit"tir (tutarı o taksitlerin kalanı);
// taksitsiz kayıtta kaydın kendi vadesi ve kalan tutarıdır.
export interface ObligationDueInfo {
  /** Bugün ve sonrası en yakın açık vade; yoksa en eski açık (geçmiş) vade; hiç yoksa null. */
  nextDueDate: string | null;
  overdueMinor: number;
  overdueCount: number;
  /** Kaydın (iptal dışı) taksit planı var mı. */
  hasInstallments: boolean;
}

export async function getDueInfoByObligation(
  workspaceId: string,
  rows: { id: string; due_date: string | null; remaining_amount_minor: number }[]
): Promise<Record<string, ObligationDueInfo>> {
  const todayIso = localIsoDate();
  const installmentsByObligation: Record<string, { due_date: string; remaining_amount_minor: number }[]> = {};
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => r.id);
    const { data, error } = await supabase
      .from('installments')
      .select('obligation_id, due_date, remaining_amount_minor')
      .eq('workspace_id', workspaceId)
      .in('obligation_id', chunk)
      .neq('status', 'iptal_edildi')
      .limit(5000);
    if (error) throw error;
    for (const row of data ?? []) {
      (installmentsByObligation[row.obligation_id] ??= []).push(row);
    }
  }

  const result: Record<string, ObligationDueInfo> = {};
  for (const row of rows) {
    const installments = installmentsByObligation[row.id];
    const open = installments
      ? installments.filter((i) => i.remaining_amount_minor > 0)
      : row.remaining_amount_minor > 0 && row.due_date
        ? [{ due_date: row.due_date, remaining_amount_minor: row.remaining_amount_minor }]
        : [];
    const overdue = open.filter((i) => i.due_date < todayIso);
    const upcoming = open.filter((i) => i.due_date >= todayIso).map((i) => i.due_date).sort();
    result[row.id] = {
      nextDueDate: upcoming[0] ?? open.map((i) => i.due_date).sort()[0] ?? row.due_date,
      overdueMinor: overdue.reduce((sum, i) => sum + i.remaining_amount_minor, 0),
      overdueCount: overdue.length,
      hasInstallments: !!installments,
    };
  }
  return result;
}

// Gecikmiş kayıtların kimlikleri (liste filtresi ve sayaçlar için). obligations.due_date ilk taksit
// tarihi olduğundan vadesi bugünden önce olan kayıtlar gerçek gecikmişlerin üst kümesidir; yalnızca
// onlar taksit bazında elenir.
export async function getOverdueObligationIds({
  workspaceId,
  direction,
  documentType,
}: {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  documentType?: string;
}): Promise<string[]> {
  let query = supabase
    .from('obligations')
    .select('id, due_date, remaining_amount_minor')
    .eq('workspace_id', workspaceId)
    .in('status', ACTIVE_OBLIGATION_STATUSES)
    .neq('document_type', 'avans')
    .lt('due_date', localIsoDate())
    .limit(1000);
  if (direction) query = query.eq('direction', direction);
  if (documentType) query = query.eq('document_type', documentType);
  const { data: candidates, error } = await query;
  if (error) throw error;
  if (!candidates?.length) return [];
  const info = await getDueInfoByObligation(workspaceId, candidates);
  return candidates.filter((c) => (info[c.id]?.overdueCount ?? 0) > 0).map((c) => c.id);
}

// Yerel takvim günü (YYYY-MM-DD). toISOString() UTC'dir: Türkiye'de 00:00–03:00 arasında dünü verirdi.
export function localIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface ObligationSummary {
  count: number;
  payableMinor: number;
  receivableMinor: number;
  /** Kalan değil, kaydın orijinal toplam tutarı — ilerleme oranı (ödenen pay) hesaplamak için. */
  payableTotalMinor: number;
  receivableTotalMinor: number;
  overdueCount: number;
}

// docs/01-finansal-kayit-modeli.md §3.2.1 — maaş, kira, vergi/SGK gibi tekrarlayan kayıtlarda
// "toplam kalan borç" tek başına yanıltıcıdır: 4 aylık maaş girer girmez dört ayın tamamı borç
// gibi görünür, kullanıcının asıl merak ettiği "bu ay ne ödeyeceğim" ve "neyi geciktirdim"
// bilgisi bu tek rakamın içinde kaybolur. Bu yüzden her borç/alacak yüzeyinde aynı üç rakam
// gösterilir: gecikmiş / bu ay ödenecek / toplam kalan.
//
// Kırılım TAKSİT seviyesinden gelir — bir obligation'ın vadeleri farklı aylara dağılır, tek bir
// obligations.due_date bu soruyu cevaplayamaz. Taksit planı olmayan kayıtlarda (tek seferlik
// borç) obligation'ın kendi due_date/remaining değeri kullanılır.
export interface DueBreakdown {
  overdueMinor: number;
  dueThisMonthMinor: number;
  remainingTotalMinor: number;
  overdueCount: number;
}

export interface DueBreakdownResult {
  payable: DueBreakdown;
  receivable: DueBreakdown;
}

const EMPTY_BREAKDOWN: DueBreakdown = {
  overdueMinor: 0,
  dueThisMonthMinor: 0,
  remainingTotalMinor: 0,
  overdueCount: 0,
};

// Bir fatura/borcu kapatmak için verilmiş ya da alınmış çek/senet (Ödeme Yap/Tahsilat Al → Çek/Senet,
// ya da OCR onayında "hangi kaydın karşılığı" seçilmiş çek) — bkz. features/payments/api.ts
// settleWithInstrument. Cari hesap mantığında çek verildiğinde cari kapanır: kapattığı fatura zaten o
// tutar kadar düşmüştür, çek/senet cari bakiyesine ikinci kez borç/alacak olarak eklenmez. Çek/senet
// vadesinde hesaptan ödenecek/tahsil edilecek bir yükümlülük olarak Çeklerim/Senetlerim'de ve
// takvimde kalır. Karşılığı seçilmeden Borç/Alacak formundan tek başına girilmiş çek/senet ise
// (eski kayıtlarda çek borcun kendisi olarak girilmişti) carinin borcu/alacağı sayılmaya devam eder.
//
// Ödeme aracı sayılan çek/senet: bir kaydı kapatmış olan (payments.settled_by_obligation_id) ya da
// fazlasından/tamamından avans doğmuş olan (obligations.parent_obligation_id) — fatura seçilmeden
// verilen peşin çekte fatura yoktur ama avans vardır; çek sayılırsa avansla birbirini götürür ve cari
// "bize borçlu" yerine 0 görünürdü.
export async function getSettlingInstrumentIds(
  workspaceId: string,
  rows: { id: string; document_type: string }[]
): Promise<Set<string>> {
  const candidateIds = rows.filter((r) => r.document_type === 'cek' || r.document_type === 'senet').map((r) => r.id);
  const result = new Set<string>();
  // .in() listesi URL'ye yazıldığı için büyük portföylerde parçalara bölünür.
  for (let i = 0; i < candidateIds.length; i += 150) {
    const chunk = candidateIds.slice(i, i + 150);
    const [settled, parents] = await Promise.all([
      supabase
        .from('payments')
        .select('settled_by_obligation_id')
        .eq('workspace_id', workspaceId)
        .in('settled_by_obligation_id', chunk),
      supabase
        .from('obligations')
        .select('parent_obligation_id')
        .eq('workspace_id', workspaceId)
        .in('parent_obligation_id', chunk),
    ]);
    if (settled.error) throw settled.error;
    if (parents.error) throw parents.error;
    for (const row of settled.data ?? []) if (row.settled_by_obligation_id) result.add(row.settled_by_obligation_id);
    for (const row of parents.data ?? []) if (row.parent_obligation_id) result.add(row.parent_obligation_id);
  }
  return result;
}

export async function getDueBreakdown({
  workspaceId,
  counterpartyId,
  documentType,
}: {
  workspaceId: string;
  /** Cari/personel detayında yalnızca o tarafın kayıtları. */
  counterpartyId?: string;
  documentType?: string;
}): Promise<DueBreakdownResult> {
  const [obligationRows, rates] = await Promise.all([
    fetchAll<{
      id: string;
      direction: string;
      document_type: string;
      currency_code: string;
      remaining_amount_minor: number;
      due_date: string | null;
    }>((from, to) => {
      let query = supabase
        .from('obligations')
        .select('id, direction, document_type, currency_code, remaining_amount_minor, due_date')
        .eq('workspace_id', workspaceId)
        .in('status', ACTIVE_OBLIGATION_STATUSES)
        // Avansın (ön ödeme/alınan avans) vadesi yoktur: gecikmiş/bu ay ödenecek sayılmaz, yalnızca
        // cari bakiyesine girer (bkz. features/payments/api.ts createAdvanceObligation).
        .neq('document_type', 'avans');
      if (counterpartyId) query = query.eq('counterparty_id', counterpartyId);
      if (documentType) query = query.eq('document_type', documentType);
      return query.order('id').range(from, to);
    }),
    listValueUnitRates(),
  ]);

  // Cari detayında faturayı kapatmış çek/senet carinin borcu/alacağı sayılmaz (bkz.
  // getSettlingInstrumentIds); genel ekranlarda (ana sayfa, Çeklerim) vadesi olan bir ödeme olarak kalır.
  const settlingInstrumentIds = counterpartyId
    ? await getSettlingInstrumentIds(workspaceId, obligationRows)
    : new Set<string>();
  const obligations = obligationRows.filter((o) => !settlingInstrumentIds.has(o.id));
  if (obligations.length === 0) {
    return { payable: { ...EMPTY_BREAKDOWN }, receivable: { ...EMPTY_BREAKDOWN } };
  }

  // .in() listesi URL'ye yazıldığı için çok sayıda kayıtta parçalara bölünür.
  const installmentRows: { obligation_id: string; due_date: string; remaining_amount_minor: number }[] = [];
  for (let i = 0; i < obligations.length; i += 100) {
    const chunk = obligations.slice(i, i + 100).map((o) => o.id);
    const rows = await fetchAll<{ obligation_id: string; due_date: string; remaining_amount_minor: number }>((from, to) =>
      supabase
        .from('installments')
        .select('obligation_id, due_date, remaining_amount_minor')
        .eq('workspace_id', workspaceId)
        .in('obligation_id', chunk)
        .gt('remaining_amount_minor', 0)
        .order('id')
        .range(from, to)
    );
    installmentRows.push(...rows);
  }

  const byObligation = new Map<string, { dueDate: string; remainingMinor: number }[]>();
  for (const row of installmentRows) {
    const list = byObligation.get(row.obligation_id) ?? [];
    list.push({ dueDate: row.due_date, remainingMinor: row.remaining_amount_minor });
    byObligation.set(row.obligation_id, list);
  }

  const today = new Date();
  const todayIso = localIsoDate(today);
  // Ay sonu, ayın gün sayısı değişken olduğu için UTC ile hesaplanır (bkz.
  // utils/installmentPlan.ts addMonthsToIsoDate — aynı gerekçe).
  const monthEndIso = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  const result: DueBreakdownResult = {
    payable: { ...EMPTY_BREAKDOWN },
    receivable: { ...EMPTY_BREAKDOWN },
  };

  for (const obligation of obligations) {
    const bucket = obligation.direction === 'receivable' ? result.receivable : result.payable;
    // Taksit planı varsa vadeler taksitlerden, yoksa kaydın kendisinden gelir.
    const dueRows = byObligation.get(obligation.id) ?? [
      { dueDate: obligation.due_date ?? todayIso, remainingMinor: obligation.remaining_amount_minor },
    ];

    for (const row of dueRows) {
      if (row.remainingMinor <= 0) continue;
      // Farklı değer birimleri (TRY, USD, gram_altin...) doğrudan toplanamaz — bkz.
      // getObligationSummary'deki aynı gerekçe.
      const refMinor = sumToReferenceMinor(
        [{ amountMinor: row.remainingMinor, unitCode: obligation.currency_code }],
        rates
      );
      bucket.remainingTotalMinor += refMinor;
      if (row.dueDate < todayIso) {
        bucket.overdueMinor += refMinor;
        bucket.overdueCount += 1;
      } else if (row.dueDate <= monthEndIso) {
        bucket.dueThisMonthMinor += refMinor;
      }
    }
  }

  return result;
}

// Liste sayfalandırıldığı için özet yüklenen sayfalardan hesaplanamaz (yalnızca ilk 30
// kaydı toplar, yanlış rakam gösterir). Bu yüzden aynı filtrelerle, sadece toplanacak
// kolonları çeken ayrı bir sorgu kullanılır.
//
// Kayıtlar farklı değer birimlerinde olabilir (TRY, USD, gram_altin, ...) — bkz.
// features/valueUnits/units.ts. Ham remaining_amount_minor/total_amount_minor değerleri
// birbirinden farklı birimlerde olduğu için doğrudan toplanamaz (5 gram altın 500 "minor"
// birim olur ve TRY kuruşuyla toplanırsa 5 TL gibi görünür); her satır önce kendi biriminin
// güncel TL karşılığına çevrilip öyle toplanır (bkz. sumToReferenceMinor).
export async function getObligationSummary({
  workspaceId,
  direction,
  documentType,
  statuses,
  ids,
  dueBefore,
  search,
}: Omit<ListObligationsFilter, 'page' | 'pageSize' | 'dueFrom' | 'dueTo'>): Promise<ObligationSummary> {
  if (ids && ids.length === 0) {
    return { count: 0, payableMinor: 0, receivableMinor: 0, payableTotalMinor: 0, receivableTotalMinor: 0, overdueCount: 0 };
  }
  type SummaryRow = {
    id: string;
    direction: string;
    remaining_amount_minor: number;
    total_amount_minor: number;
    currency_code: string;
    status: string;
    due_date: string | null;
  };
  const [rows, rates, overdueIds] = await Promise.all([
    fetchAll<SummaryRow>((from, to) => {
      let query = supabase
        .from('obligations')
        .select('id, direction, remaining_amount_minor, total_amount_minor, currency_code, status, due_date')
        .eq('workspace_id', workspaceId);
      if (ids) query = query.in('id', ids);
      if (direction) query = query.eq('direction', direction);
      if (documentType) query = query.eq('document_type', documentType);
      if (statuses?.length) query = query.in('status', statuses);
      if (dueBefore) query = query.lt('due_date', dueBefore);
      const trimmedSearch = search?.trim();
      if (trimmedSearch) query = query.ilike('title', `%${trimmedSearch}%`);
      return query.order('id').range(from, to);
    }),
    listValueUnitRates(),
    getOverdueObligationIds({ workspaceId, direction, documentType }),
  ]);

  const overdueIdSet = new Set(overdueIds);
  const payableRows = rows.filter((r) => r.direction === 'payable');
  const receivableRows = rows.filter((r) => r.direction === 'receivable');
  return {
    count: rows.length,
    payableMinor: sumToReferenceMinor(
      payableRows.map((r) => ({ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code })),
      rates
    ),
    receivableMinor: sumToReferenceMinor(
      receivableRows.map((r) => ({ amountMinor: r.remaining_amount_minor, unitCode: r.currency_code })),
      rates
    ),
    payableTotalMinor: sumToReferenceMinor(
      payableRows.map((r) => ({ amountMinor: r.total_amount_minor, unitCode: r.currency_code })),
      rates
    ),
    receivableTotalMinor: sumToReferenceMinor(
      receivableRows.map((r) => ({ amountMinor: r.total_amount_minor, unitCode: r.currency_code })),
      rates
    ),
    overdueCount: rows.filter((r) => overdueIdSet.has(r.id)).length,
  };
}

export interface ObligationTypeTotal {
  count: number;
  totalMinor: number;
}

// "Daha Fazla" hub'ındaki kutu sayaçları. Sayfalı listeden türetilirse sayfa boyutuyla
// sınırlı kalacağı için tür bazlı toplamlar ayrı ve dar bir sorgudan gelir.
//
// Dönüş tipi Map değil düz nesnedir: react-query cache'i AsyncStorage'a JSON olarak
// yazılıyor (services/queryClient.ts) ve Map, JSON.stringify'da "{}" olur — uygulama
// yeniden açıldığında .get() patlardı.
export async function getObligationTotalsByType(
  workspaceId: string,
  statuses: Obligation['status'][] = ACTIVE_OBLIGATION_STATUSES
): Promise<Record<string, ObligationTypeTotal>> {
  const [data, rates] = await Promise.all([
    fetchAll<{ document_type: string; remaining_amount_minor: number; currency_code: string }>((from, to) =>
      supabase
        .from('obligations')
        .select('document_type, remaining_amount_minor, currency_code')
        .eq('workspace_id', workspaceId)
        .in('status', statuses)
        .order('id')
        .range(from, to)
    ),
    listValueUnitRates(),
  ]);

  const totals: Record<string, ObligationTypeTotal> = {};
  for (const row of data) {
    if (!row.document_type) continue;
    const current = totals[row.document_type] ?? { count: 0, totalMinor: 0 };
    totals[row.document_type] = {
      count: current.count + 1,
      totalMinor:
        current.totalMinor + sumToReferenceMinor([{ amountMinor: row.remaining_amount_minor, unitCode: row.currency_code }], rates),
    };
  }
  return totals;
}

export interface ListInstallmentsDueFilter {
  workspaceId: string;
  direction?: 'payable' | 'receivable';
  statuses?: Obligation['status'][];
  dueFrom?: string;
  dueTo?: string;
  /** Yalnızca kalan tutarı > 0 olan (ödenmemiş) taksitler. */
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
}

// Taksitli bir kredi/borcun HER taksiti kendi vadesinde ayrı bir kayıt olarak görünsün
// diye (bkz. takvim ve Hareketler ekranları) — listObligations tek satır (obligation'ın
// kendi due_date'i = ilk taksit) döndürdüğünden, 2. ve sonraki taksitler bu fonksiyon
// olmadan hiçbir yerde listelenmezdi.
export async function listInstallmentsDue({
  workspaceId,
  direction,
  statuses,
  dueFrom,
  dueTo,
  openOnly,
  page = 0,
  pageSize = OBLIGATIONS_PAGE_SIZE,
}: ListInstallmentsDueFilter): Promise<ObligationDueItem[]> {
  let query = supabase
    .from('installments')
    .select(
      'id, installment_number, due_date, amount_minor, remaining_amount_minor, status, payments(paid_at), obligation:obligations!inner(*, category:categories(name), counterparty:counterparties(name), account:accounts(name))'
    )
    .eq('workspace_id', workspaceId)
    .neq('status', 'iptal_edildi');

  if (direction) query = query.eq('obligation.direction', direction);
  if (statuses?.length) query = query.in('obligation.status', statuses);
  if (dueFrom) query = query.gte('due_date', dueFrom);
  if (dueTo) query = query.lte('due_date', dueTo);
  if (openOnly) query = query.gt('remaining_amount_minor', 0);

  const { data, error } = await query
    .order('due_date', { ascending: true })
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;

  return (
    data as unknown as (Installment & { obligation: ObligationWithRelations; payments?: { paid_at: string }[] })[]
  ).map((row) => ({
    ...row.obligation,
    due_date: row.due_date,
    total_amount_minor: row.amount_minor,
    remaining_amount_minor: row.remaining_amount_minor,
    status: row.status,
    installment_id: row.id,
    installment_number: row.installment_number,
    // row.obligation.payments TÜM taksitlerin ödemelerini taşır — burada yalnızca BU taksite
    // ait ödemeler istenir (installment_id ile ilişkili), o yüzden yukarıdaki spread'i ezer.
    payments: row.payments,
  }));
}

// Toplam/özet hesaplayan ekranlar (Ana Sayfa, Raporlar, nakit tahmini) sabit "ilk 200 kayıt" yerine
// tüm sayfaları okur — 200'ü aşınca borç/alacak toplamı sessizce eksik kalırdı. Supabase tek
// istekte en fazla 1.000 satır döndürdüğü için sayfa boyutu 500'dür.
const ALL_PAGES_SIZE = 500;
const ALL_PAGES_LIMIT = 40;

export async function listAllObligations(
  filter: Omit<ListObligationsFilter, 'page' | 'pageSize'>
): Promise<ObligationWithRelations[]> {
  const all: ObligationWithRelations[] = [];
  for (let page = 0; page < ALL_PAGES_LIMIT; page += 1) {
    const rows = await listObligations({ ...filter, page, pageSize: ALL_PAGES_SIZE });
    all.push(...rows);
    if (rows.length < ALL_PAGES_SIZE) break;
  }
  return all;
}

export async function listAllInstallmentsDue(
  filter: Omit<ListInstallmentsDueFilter, 'page' | 'pageSize'>
): Promise<ObligationDueItem[]> {
  const all: ObligationDueItem[] = [];
  for (let page = 0; page < ALL_PAGES_LIMIT; page += 1) {
    const rows = await listInstallmentsDue({ ...filter, page, pageSize: ALL_PAGES_SIZE });
    all.push(...rows);
    if (rows.length < ALL_PAGES_SIZE) break;
  }
  return all;
}

export async function getObligation(id: string): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getObligationWithInstallments(
  id: string
): Promise<{ obligation: ObligationWithRelations; installments: Installment[] }> {
  const [{ data: obligation, error: obligationError }, { data: installments, error: installmentsError }] =
    await Promise.all([
      supabase
        .from('obligations')
        .select('*, category:categories(name), counterparty:counterparties(name), account:accounts(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('installments')
        .select('*')
        .eq('obligation_id', id)
        .order('installment_number', { ascending: true }),
    ]);

  if (obligationError) throw obligationError;
  if (installmentsError) throw installmentsError;
  return { obligation: obligation as unknown as ObligationWithRelations, installments };
}

// docs/12-mvp-kabul-kriterleri.md — taksitli borçlarda bildirim, ödenmiş taksitlerin
// sabit vade tarihine değil bir sonraki bekleyen taksitin vadesine göre planlanmalıdır.
export interface NextPendingInstallment {
  dueDate: string;
  remainingAmountMinor: number;
}

// Hatırlatma bildiriminde kredinin toplam bakiyesi değil, bu bekleyen taksitin
// kendi tutarı gösterilsin diye (bkz. services/notifications.ts) — kredinin
// toplam borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
export async function getNextPendingInstallment(obligationId: string): Promise<NextPendingInstallment | null> {
  const { data, error } = await supabase
    .from('installments')
    .select('due_date, remaining_amount_minor')
    .eq('obligation_id', obligationId)
    .gt('remaining_amount_minor', 0)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { dueDate: data.due_date, remainingAmountMinor: data.remaining_amount_minor } : null;
}

export interface ObligationInstallmentSummary {
  totalCount: number;
  remainingCount: number;
  nextDueDate: string | null;
  nextAmountMinor: number | null;
  principalSumMinor: number;
  interestSumMinor: number;
  /** En az bir taksitte hem anapara hem faiz kırılımı doluysa true. */
  hasRateData: boolean;
}

// Kredilerim listesindeki kartlar için toplu taksit özeti (bkz. app/obligations/index.tsx).
// getNextPendingInstallment'ın tekil mantığının, bir sayfa kayıt için N+1 sorgu atmadan
// toplu hâli. Dönüş tipi Map değil Record'dur (bkz. getObligationTotalsByType'taki aynı
// gerekçe — react-query cache'i AsyncStorage'a JSON olarak yazılır, Map "{}" olur).
export async function getObligationInstallmentSummaries(
  workspaceId: string,
  obligationIds: string[]
): Promise<Record<string, ObligationInstallmentSummary>> {
  if (obligationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('installments')
    .select('obligation_id, due_date, remaining_amount_minor, principal_minor, interest_minor')
    .eq('workspace_id', workspaceId)
    .in('obligation_id', obligationIds)
    .neq('status', 'iptal_edildi')
    .order('due_date', { ascending: true });
  if (error) throw error;

  const summaries: Record<string, ObligationInstallmentSummary> = {};
  for (const row of data ?? []) {
    const current = summaries[row.obligation_id] ?? {
      totalCount: 0,
      remainingCount: 0,
      nextDueDate: null,
      nextAmountMinor: null,
      principalSumMinor: 0,
      interestSumMinor: 0,
      hasRateData: false,
    };

    current.totalCount += 1;
    const isRemaining = row.remaining_amount_minor > 0;
    if (isRemaining) {
      current.remainingCount += 1;
      // Satırlar due_date artan geldiği için bir obligation_id için ilk kalan taksit
      // doğal olarak "sıradaki" olur.
      if (current.nextDueDate === null) {
        current.nextDueDate = row.due_date;
        current.nextAmountMinor = row.remaining_amount_minor;
      }
    }
    if (row.principal_minor !== null && row.interest_minor !== null) {
      current.principalSumMinor += row.principal_minor;
      current.interestSumMinor += row.interest_minor;
      current.hasRateData = true;
    }

    summaries[row.obligation_id] = current;
  }
  return summaries;
}

export async function createObligation(input: TablesInsert<'obligations'>): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

// docs/01-finansal-kayit-modeli.md §8 — total_amount_minor değişirse
// obligations_recompute_on_amount_change trigger'ı remaining_amount_minor ve status'ü otomatik günceller.
export async function updateObligation(id: string, input: TablesUpdate<'obligations'>): Promise<Obligation> {
  const { data, error } = await supabase.from('obligations').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// Taksit ve ödeme geçmişi veritabanında CASCADE ile birlikte silinir (bkz. installments/payments FK'leri).
export async function deleteObligation(id: string): Promise<void> {
  const { error } = await supabase.from('obligations').delete().eq('id', id);
  if (error) throw error;
}

export interface CreateInstallmentPlanInput {
  workspaceId: string;
  obligationId: string;
  totalAmountMinor: number;
  installments: {
    installmentNumber: number;
    dueDate: string;
    amountMinor: number;
    principalMinor?: number | null;
    interestMinor?: number | null;
  }[];
}

export async function createInstallmentPlan({
  workspaceId,
  obligationId,
  totalAmountMinor,
  installments,
}: CreateInstallmentPlanInput): Promise<Installment[]> {
  if (!installmentTotalMatches(totalAmountMinor, installments.map((i) => i.amountMinor))) {
    throw new Error('Taksit toplamı, ana tutarla uyuşmuyor.');
  }

  const rows: TablesInsert<'installments'>[] = installments.map((installment) => ({
    workspace_id: workspaceId,
    obligation_id: obligationId,
    installment_number: installment.installmentNumber,
    due_date: installment.dueDate,
    amount_minor: installment.amountMinor,
    principal_minor: installment.principalMinor ?? null,
    interest_minor: installment.interestMinor ?? null,
  }));

  const { data, error } = await supabase.from('installments').insert(rows).select('*');
  if (error) throw error;
  return data;
}

export interface UpdateInstallmentPlanRow {
  /** null → yeni taksit (kuyruğa eklendi), doluysa mevcut satır güncellenir. */
  id: string | null;
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  remainingAmountMinor: number;
  status: string;
  principalMinor: number | null;
  interestMinor: number | null;
}

// Taksit planı düzenlemesi (bkz. app/obligations/new.tsx InstallmentPlanEditor):
// yalnızca değişen satırlar `rows`'ta gelir (değişmeyenler çağıran tarafta elenir),
// kaldırılan taksitler `removedIds` ile silinir. remaining_amount_minor/status çağıran
// tarafta (utils/installmentPlan.ts recomputeInstallmentAfterAmountEdit) önceden
// hesaplanmış olarak gelir — installments UPDATE'inde bunu otomatik yeniden hesaplayan
// bir trigger yoktur (yalnızca ödemeler değişince tetiklenir).
// Dönüş: yeni eklenen taksit satırları. Çağıran taraf bunları "ödendi" işaretlemek için
// (bkz. app/obligations/new.tsx toplu ödendi akışı) id'leriyle birlikte kullanır — insert
// öncesi id bilinmediği için bu bilgi başka türlü elde edilemez.
export async function updateInstallmentPlan({
  workspaceId,
  obligationId,
  rows,
  removedIds,
}: {
  workspaceId: string;
  obligationId: string;
  rows: UpdateInstallmentPlanRow[];
  removedIds: string[];
}): Promise<Installment[]> {
  if (removedIds.length > 0) {
    const { error } = await supabase.from('installments').delete().in('id', removedIds);
    if (error) throw error;
  }

  const toInsert = rows.filter((r) => !r.id);
  const toUpdate = rows.filter((r): r is UpdateInstallmentPlanRow & { id: string } => !!r.id);

  let inserted: Installment[] = [];
  if (toInsert.length > 0) {
    const insertRows: TablesInsert<'installments'>[] = toInsert.map((r) => ({
      workspace_id: workspaceId,
      obligation_id: obligationId,
      installment_number: r.installmentNumber,
      due_date: r.dueDate,
      amount_minor: r.amountMinor,
    }));
    const { data, error } = await supabase.from('installments').insert(insertRows).select('*');
    if (error) throw error;
    inserted = data ?? [];
  }

  for (const r of toUpdate) {
    const { error } = await supabase
      .from('installments')
      .update({
        installment_number: r.installmentNumber,
        due_date: r.dueDate,
        amount_minor: r.amountMinor,
        remaining_amount_minor: r.remainingAmountMinor,
        status: r.status,
        principal_minor: r.principalMinor,
        interest_minor: r.interestMinor,
      })
      .eq('id', r.id);
    if (error) throw error;
  }

  return inserted;
}

export interface LinkedDocument {
  id: string;
  fileName: string;
  fieldCount: number;
  createdAt: string;
}

// Kayda OCR ile bağlanmış orijinal belge (belge ve finans kaydı birbirine bağlı saklanır —
// CLAUDE.md kural 6). Elle girilen kayıtta belge yoktur.
export async function getLinkedDocument(obligationId: string): Promise<LinkedDocument | null> {
  const { data, error } = await supabase
    .from('financial_documents')
    .select('id, file_name, created_at')
    .eq('obligation_id', obligationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count, error: countError } = await supabase
    .from('document_fields')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', data.id);
  if (countError) throw countError;
  return { id: data.id, fileName: data.file_name, fieldCount: count ?? 0, createdAt: data.created_at };
}
