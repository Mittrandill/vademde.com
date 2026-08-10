import { formatAmountInput } from '@/utils/money';
import { TextField, type TextFieldProps } from './TextField';

export interface AmountFieldProps extends Omit<TextFieldProps, 'keyboardType' | 'onChangeText'> {
  onChangeText: (value: string) => void;
  /** Ondalık hane sayısı — 2 (kuruş/cent) varsayılan, 0 adet bazlı birimlerde (ör. çeyrek
   * altın, bkz. features/valueUnits/units.ts ValueUnit.precision) virgülü tamamen kapatır. */
  precision?: 0 | 2;
}

// Tüm para tutarı girişlerinin ortak noktası: yazarken binlik ayıracı otomatik eklenir
// (bkz. utils/money.ts formatAmountInput) — kullanıcı geri bildirimi: büyük tutarlar
// (özellikle milyon seviyesinde) ayraçsız okunması karışıyordu. Yüzde/oran gibi para
// olmayan sayısal alanlarda (komisyon oranı, faiz oranı) bu bileşen KULLANILMAZ, düz
// TextField kalır — oran her zaman küçük bir sayıdır, gruplamaya ihtiyaç duymaz.
export function AmountField({ value, onChangeText, precision = 2, ...rest }: AmountFieldProps) {
  return (
    <TextField
      {...rest}
      keyboardType={precision === 0 ? 'number-pad' : 'decimal-pad'}
      value={value}
      onChangeText={(text) => onChangeText(formatAmountInput(text, precision))}
    />
  );
}
