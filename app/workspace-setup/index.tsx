import { useState } from 'react';
import { InteractionManager, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { AmountField, Button, Card, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { OnboardingWorkspaceIllustration } from '@/components/brand/OnboardingWorkspaceIllustration';
import { setupInitialWorkspaces } from '@/features/workspaces/api';
import { usePlanEnforcement } from '@/features/subscriptions/usePlanEnforcement';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { parseAmountToMinor } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert } from '@/utils/alerts';

type WorkspaceMode = 'personal' | 'business' | 'both';

const MODE_OPTIONS: { key: WorkspaceMode; label: string }[] = [
  { key: 'personal', label: 'Kişisel' },
  { key: 'business', label: 'İşletme' },
  { key: 'both', label: 'Her ikisi' },
];

const DEFAULT_NAME: Record<'personal' | 'business', string> = {
  personal: 'Kişisel Bütçe',
  business: 'İşletme Bütçe',
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — onboarding'in son adımı: çalışma alanı türü,
// adı ve isteğe bağlı başlangıç bakiyesi. Oturum açmış ama hiç çalışma alanı olmayan
// kullanıcılar buraya yönlendirilir (bkz. app/(tabs)/index.tsx). İlk adım, zaten bir davet
// kodu olan kullanıcıyı (ör. ekip arkadaşı davet etmiş) doğrudan /workspace/join'e yönlendirip
// burada gereksiz bir "çalışma alanı oluştur" formuyla karşılaşmasını önler — bkz. Ayarlar'daki
// "Çalışma Alanı Oluştur / Katıl" satırı da aynı seçim ekranına açılır.
export default function WorkspaceSetupScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  // /workspace ekranındaki "Yeni Çalışma Alanı Oluştur" gibi kullanıcının niyeti zaten
  // belliyken bu route'a girenler, seçim ekranını atlayıp doğrudan forma düşer. Bu durumda
  // "Geri" de seçim ekranına değil, geldikleri ekrana (router.back) döner — aksi halde
  // hiç görmedikleri "Vademde'ye Hoş Geldin" ekranına düşüp kafaları karışır. Seçim
  // ekranından 'create'e geçen (ilk kullanıcı/onboarding) kullanıcı için "Geri" hâlâ
  // seçim ekranına döner (bu route'a router.replace ile girildiği için gidecek başka
  // bir ekran yok).
  const { step: initialStep } = useLocalSearchParams<{ step?: string }>();
  const skippedChoice = initialStep === 'create';

  const [step, setStep] = useState<'choice' | 'create'>(skippedChoice ? 'create' : 'choice');
  const [mode, setMode] = useState<WorkspaceMode>('personal');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  // "Her ikisi" tek çağrıda iki çalışma alanı açar; ücretsiz planda tek alan hakkı olduğu
  // için bu seçenek kilitlidir. Sunucu tarafı da ayrıca reddeder (setup_initial_workspaces
  // içindeki WORKSPACE_LIMIT_REACHED) — buradaki kontrol yalnızca kullanıcıyı hataya
  // düşürmeden önce durdurmak içindir.
  const planQuery = usePlanEnforcement();
  const planState = planQuery.data ?? null;
  const remainingSlots = planState ? planState.workspaceLimit - planState.workspaceCount : null;
  const bothLocked = remainingSlots !== null && remainingSlots < 2;
  const singleLocked = remainingSlots !== null && remainingSlots < 1;

  const isBoth = mode === 'both';
  const trimmedName = name.trim();
  const modeLocked = isBoth ? bothLocked : singleLocked;
  const canSubmit = !modeLocked && (isBoth || trimmedName.length > 0);

  const setupMutation = useMutation({
    mutationFn: async () => {
      const balance = openingBalance.trim();
      // Tüm oluşturma tek atomik RPC'de yapılır (bkz. setupInitialWorkspaces); 'both'
      // modunda yarım kalma riski yoktur.
      return setupInitialWorkspaces({
        mode,
        name: isBoth ? null : trimmedName,
        openingBalanceMinor: !isBoth && balance ? parseAmountToMinor(balance) ?? 0 : null,
      });
    },
    onError: (error) => showErrorAlert(error),
    onSuccess: (primaryWorkspaceId: string) => {
      // review.tsx'teki aynı Fabric çakışması: invalidation ve navigasyon aynı anda/ters
      // sırada tetiklenirse ekran hâlâ mount'tayken arkadaki view çöküyor. Navigasyon hemen
      // (senkron), invalidation bir sonraki etkileşim turuna ertelenir.
      setActiveWorkspaceId(primaryWorkspaceId);
      router.replace('/(tabs)');
      InteractionManager.runAfterInteractions(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      });
    },
  });

  // Butonun aynı frame içinde iki kez tetiklenip (isPending henüz true olmadan) iki/dört
  // kopya çalışma alanı oluşturmasını engelleyen ek koruma.
  const handleSubmit = () => {
    if (setupMutation.isPending) return;
    setupMutation.mutate();
  };

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      {step === 'create' ? (
        <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
          <ScreenHeader
            title=""
            left={{
              icon: 'chevron-back',
              accessibilityLabel: 'Geri',
              onPress: () => (skippedChoice ? router.back() : setStep('choice')),
            }}
          />
        </View>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, flexGrow: 1, justifyContent: 'center' }}
        >
          <Stack gap="xl" align="center">
            <OnboardingWorkspaceIllustration size={140} />

            {step === 'choice' ? (
              <>
                <Stack gap="xs" align="center">
                  <Text variant="pageTitle" style={{ textAlign: 'center' }}>
                    Vademde&apos;ye Hoş Geldin
                  </Text>
                  <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
                    Kendi çalışma alanını oluştur veya seni davet eden bir ekibe davet koduyla katıl.
                  </Text>
                </Stack>

                <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
                  <ChoiceOption
                    icon="add-circle-outline"
                    title="Kendi Çalışma Alanımı Oluştur"
                    description="Kişisel veya işletme bütçeni sıfırdan kur."
                    onPress={() => setStep('create')}
                  />
                  <ChoiceOption
                    icon="enter-outline"
                    title="Davet Koduyla Katıl"
                    description="Bir ekip arkadaşının paylaştığı kodla mevcut çalışma alanına katıl."
                    onPress={() => router.push('/workspace/join')}
                  />
                </Stack>
              </>
            ) : (
              <>
                <Stack gap="xs" align="center">
                  <Text variant="pageTitle" style={{ textAlign: 'center' }}>
                    Çalışma Alanını Kur
                  </Text>
                  <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
                    Kişisel veya işletme bütçenizi takip etmek için bir çalışma alanı oluşturun.
                  </Text>
                </Stack>

                <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
                  <Text variant="caption" color="textSecondary">
                    NASIL KULLANACAKSINIZ?
                  </Text>
                  <SegmentedControl
                    options={MODE_OPTIONS.map((option) => ({
                      ...option,
                      label:
                        option.key === 'both' && bothLocked ? `${option.label} · Plus` : option.label,
                    }))}
                    value={mode}
                    onChange={setMode}
                    stretch
                  />
                </Stack>

                {modeLocked ? (
                  <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
                    <Text variant="caption" color="danger">
                      {isBoth
                        ? `"Her ikisi" iki ayrı çalışma alanı oluşturur. Planınızda ${remainingSlots ?? 0} alan hakkı kaldı — kişisel veya işletmeden birini seçebilir ya da planınızı yükseltebilirsiniz.`
                        : 'Planınızdaki çalışma alanı hakkınızın tamamını kullandınız. Yeni bir alan için planınızı yükseltin.'}
                    </Text>
                    <Button label="Planları gör" onPress={() => router.push('/paywall')} />
                  </Stack>
                ) : null}

                {isBoth ? (
                  <Text variant="caption" color="textSecondary" style={{ alignSelf: 'stretch' }}>
                    &ldquo;Kişisel&rdquo; ve &ldquo;İşletme&rdquo; adıyla iki ayrı çalışma alanı oluşturulur;
                    adlarını ve başlangıç bakiyelerini daha sonra Ayarlar&apos;dan düzenleyebilirsiniz.
                  </Text>
                ) : (
                  <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
                    <TextField
                      label="ÇALIŞMA ALANI ADI"
                      placeholder={DEFAULT_NAME[mode]}
                      value={name}
                      onChangeText={setName}
                    />
                    <AmountField
                      label="BAŞLANGIÇ BAKİYESİ (İSTEĞE BAĞLI)"
                      placeholder="0,00"
                      value={openingBalance}
                      onChangeText={setOpeningBalance}
                    />
                  </Stack>
                )}

                <Button
                  label="Çalışma Alanını Oluştur"
                  onPress={handleSubmit}
                  loading={setupMutation.isPending}
                  disabled={!canSubmit}
                />
              </>
            )}
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChoiceOption({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress}>
      <Card>
        <Row gap="sm" align="center">
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
            }}
          >
            <Ionicons name={icon} size={20} color={theme.colors.brandPrimary} />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle">{title}</Text>
            <Text variant="caption" color="textSecondary">
              {description}
            </Text>
          </Stack>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </Row>
      </Card>
    </Pressable>
  );
}
