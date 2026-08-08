import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import { formatMinorAmount } from '@/utils/money';

export interface CalendarExportObligation {
  title: string;
  direction: string;
  due_date: string | null;
  remaining_amount_minor: number;
  currency_code: string;
}

const VADEMDE_REMINDER_LIST_NAME = 'Vademde';

function titleFor(obligation: CalendarExportObligation): string {
  const label = obligation.direction === 'payable' ? 'Ödeme' : 'Tahsilat';
  return `${label}: ${obligation.title} — ${formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}`;
}

function dueDateAt(dueDate: string, hour: number): Date {
  const [year, month, day] = dueDate.split('-').map(Number);
  return new Date(year, month - 1, day, hour, 0, 0);
}

async function getWritableEventCalendar(): Promise<Calendar.ExpoCalendar> {
  // iOS'ta uygulamalar arası tek bir "varsayılan" takvim vardır; Android'de böyle bir
  // kavram yok (bkz. expo-calendar dokümantasyonu), bu yüzden değiştirilebilir ilk takvim seçilir.
  if (Platform.OS === 'ios') return Calendar.getDefaultCalendarSync();
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.allowsModifications);
  if (!writable) throw new Error('Yazılabilir bir takvim bulunamadı.');
  return writable;
}

// docs/01-finansal-kayit-modeli.md — bu yalnızca kullanıcının kendi takvim/hatırlatıcı
// uygulamasına birer kopya bırakır; Vademde'nin kendi hatırlatma/bildirim akışını
// (services/notifications.ts) hiçbir şekilde değiştirmez veya onun yerine geçmez.
export async function addObligationToCalendar(obligation: CalendarExportObligation): Promise<void> {
  if (!obligation.due_date) throw new Error('Bu kaydın vade tarihi yok.');
  const { granted } = await Calendar.requestCalendarPermissions();
  if (!granted) throw new Error('Takvim izni verilmedi.');

  const calendar = await getWritableEventCalendar();
  const startDate = dueDateAt(obligation.due_date, 9);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  await calendar.createEvent({
    title: titleFor(obligation),
    startDate,
    endDate,
    notes: 'Vademde uygulamasından eklendi.',
  });
}

async function getOrCreateReminderList(): Promise<Calendar.ExpoCalendar> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
  const existing = calendars.find((c) => c.title === VADEMDE_REMINDER_LIST_NAME);
  if (existing) return existing;

  const source = calendars[0]?.source ?? Calendar.getDefaultCalendarSync().source;

  return Calendar.createCalendar({
    title: VADEMDE_REMINDER_LIST_NAME,
    color: '#FFB000',
    entityType: Calendar.EntityTypes.REMINDER,
    source,
    ownerAccount: VADEMDE_REMINDER_LIST_NAME,
  });
}

// expo-calendar'ın Hatırlatıcılar (Reminders) API'si yalnızca iOS'ta çalışır (EventKit
// EKReminder Android'de yok) — bkz. docs/06-teknik-mimari.md, uygulama iOS öncelikli.
export async function createObligationReminder(obligation: CalendarExportObligation): Promise<void> {
  if (Platform.OS !== 'ios') throw new Error("Hatırlatıcılar şu an yalnızca iOS'ta destekleniyor.");
  if (!obligation.due_date) throw new Error('Bu kaydın vade tarihi yok.');
  const { granted } = await Calendar.requestRemindersPermissions();
  if (!granted) throw new Error('Hatırlatıcılar izni verilmedi.');

  const calendar = await getOrCreateReminderList();

  await calendar.createReminder({
    title: titleFor(obligation),
    dueDate: dueDateAt(obligation.due_date, 9),
    notes: 'Vademde uygulamasından eklendi.',
  });
}
