import { ScrollableTabs } from '@/components/primitives';

// Yasal metinlerde bölüme atlama çipleri (Yasal.html). Etiket, "3. İşleme Amaçları" gibi
// başlıkların madde numarasıdır; çipe dokununca ekran o bölüme kayar.
export function SectionJumpChips({
  titles,
  activeIndex,
  onJump,
}: {
  titles: string[];
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  const tabs = titles.map((title, index) => ({
    key: String(index),
    label: title.match(/^\d+/)?.[0] ?? String(index + 1),
  }));
  return <ScrollableTabs tabs={tabs} activeKey={String(activeIndex)} onChange={(key) => onJump(Number(key))} />;
}
