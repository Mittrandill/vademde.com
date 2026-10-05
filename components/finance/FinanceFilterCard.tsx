import { ScrollableTabs } from '@/components/primitives';

export interface FinanceFilterOption<T extends string> {
  key: T;
  label: string;
}

export interface FinanceFilterCardProps<T extends string> {
  /** Eski kart başlığı/açıklaması; yeni tasarımda çizilmez (çağıran kod değişmesin diye kaldı). */
  title: string;
  description: string;
  options: FinanceFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Liste ekranlarının durum/tür filtresi: yeni tasarımda kartsız, yatay kayar sekmeler
// (HANDOFF §3 ScrollableTabs). Props eski kartla aynı.
export function FinanceFilterCard<T extends string>({ options, value, onChange }: FinanceFilterCardProps<T>) {
  return <ScrollableTabs tabs={options} activeKey={value} onChange={(key) => onChange(key as T)} />;
}
