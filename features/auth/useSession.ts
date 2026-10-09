import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useIsRestoring } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';
import { bindQueryCacheToUser } from '@/services/queryClient';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isRestoring = useIsRestoring();
  const currentUser = useRef<string | null>(null);

  useEffect(() => {
    if (isRestoring) return;
    let alive = true;
    let generation = 0;
    const applySession = async (nextSession: Session | null) => {
      const current = ++generation;
      if (currentUser.current !== (nextSession?.user.id ?? null)) {
        setSession(null);
        setIsLoading(true);
      }
      try {
        await bindQueryCacheToUser(nextSession?.user.id ?? null);
        if (alive && current === generation) {
          currentUser.current = nextSession?.user.id ?? null;
          setSession(nextSession);
        }
      } catch (error) {
        // Fail closed: do not display another user's cache if storage fails.
        console.error('Oturum önbelleği hazırlanamadı', error);
        if (alive && current === generation) setSession(null);
      } finally {
        if (alive && current === generation) setIsLoading(false);
      }
    };
    const initialGeneration = generation;
    supabase.auth.getSession().then(({ data }) => {
      if (generation === initialGeneration) void applySession(data.session);
    }).catch(() => { if (alive) void applySession(null); });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Do not await inside Supabase's auth callback (auth operations hold a lock).
      void applySession(nextSession);
    });

    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [isRestoring]);

  return { session, isLoading: isLoading || isRestoring };
}
