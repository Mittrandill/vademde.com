import { useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { DatePickerSheet } from './DateSheets';
import { TextField } from './TextField';

export interface DateFieldProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  tag?: ReactNode;
}

// HANDOFF §3 — takvim artık ortak DatePickerSheet; alan yine de düz metin girişi kalır,
// kullanıcı elle de yazabilir.
export function DateField({ label, value, onChangeText, placeholder = 'YYYY-AA-GG', style, tag }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

  return (
    <>
      <TextField
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
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
          value={isValid ? value.trim() : null}
          onChange={onChangeText}
          title={label ?? 'Tarih seç'}
        />
      ) : null}
    </>
  );
}
