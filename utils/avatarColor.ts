// İsimden deterministik renk/baş harf türeten genel yardımcılar — banka logosu eşleşmesi
// olmayan hesap/kayıtlarda (bkz. features/banks/banks.ts) ve kişi/firma avatarlarında
// (bkz. components/finance/PersonAvatar.tsx) aynı görsel dili paylaşmak için tek yerden.
const AVATAR_COLORS = ['#EF6C57', '#3D8BFF', '#22A06B', '#9B6EF3', '#F2A93B', '#12A594', '#E8577A', '#5D6B98'];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '');
  return letters.join('') || '?';
}
