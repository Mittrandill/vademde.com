import { useLocalSearchParams } from 'expo-router';
import { AssetDetailScreen } from '@/features/assets/screens';
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssetDetailScreen id={id} />;
}
