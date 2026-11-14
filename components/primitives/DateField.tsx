import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { DatePickerSheet } from './DateSheets';
import { TextField } from './TextField';
import { getLanguage, t } from '@/i18n';

export interface DateFieldProps {
  label?: string;
  /** Her zaman yerel ISO tarih (YYYY-AA-GG) ya da boş metin. */
  value: string;
  /** Yalnızca geçerli bir ISO tarih ya da (alan temizlenince / yarım kalınca) '' ile çağrılır. */
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  tag?: ReactNode;
}

const ISO_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

// Kayıtlar, sorgular ve ekranların kendi mantığı ISO tarihle çalışır; kullanıcı ise alanı
// GG/AA/YYYY olarak görür ve yazar. Dönüşüm yalnızca bu bileşende yapılır.
function isoToDisplay(value: string): string {
  const match = ISO_PREFIX.exec(value.trim());
  // OCR'dan gelen serbest metin gibi ISO olmayan bir değer olduğu gibi gösterilir.
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function displayToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // 31/02 gibi takvimde olmayan günler reddedilir (Date taşmayı sonraki aya kaydırırdı).
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// Yazarken eğik çizgiler otomatik eklenir: "14112026" → "14/11/2026".
function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// HANDOFF §3 — takvim ortak DatePickerSheet; alan yine de elle yazılabilir.
export function DateField({ label, value, onChangeText, placeholder, style, tag }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToDisplay(value));
  // Üst bileşene en son gönderilen değer. Yarım yazılmış bir tarih için '' gönderiyoruz;
  // o '' geri geldiğinde kullanıcının yazdığı metni silmemek için yalnızca dışarıdan gelen
  // gerçek değişiklikler (ör. takvimden seçim, OCR ön doldurma) metni yeniler.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(isoToDisplay(value));
    }
  }, [value]);

  const emit = (next: string) => {
    lastEmitted.current = next;
    if (next !== value) onChangeText(next);
  };

  const handleChangeText = (raw: string) => {
    const masked = maskInput(raw);
    setText(masked);
    emit(displayToIso(masked) ?? '');
  };

  const handlePick = (iso: string) => {
    setText(isoToDisplay(iso));
    emit(iso);
  };

  const isValid = ISO_PREFIX.test(value.trim());
  const resolvedPlaceholder = placeholder ?? (getLanguage() === 'tr' ? 'GG/AA/YYYY' : 'DD/MM/YYYY');

  return (
    <>
      <TextField
        label={label}
        placeholder={resolvedPlaceholder}
        value={text}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        maxLength={10}
        rightIcon="calendar-outline"
        onRightIconPress={() => setOpen(true)}
        style={style}
        tag={tag}
      />
      {/* Sheet yalnızca açıkken mount edilir: bu alan listelerde tekrarlanıyor (ör. belge onay
          ekranındaki 36 taksitlik kredi tablosu = 36 DateField); iOS'ta her Modal ayrı bir
          UIViewController açtığından hepsi birden mount'luyken bellek şişip uygulama çöküyordu. */}
      {open ? (
        <DatePickerSheet
          visible
          onClose={() => setOpen(false)}
          value={isValid ? value.trim().slice(0, 10) : null}
          onChange={handlePick}
          title={label ?? t('ui.date.pick')}
        />
      ) : null}
    </>
  );
}
