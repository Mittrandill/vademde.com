import type { QueryClient } from '@tanstack/react-query';

type InteractionTask = { cancel: () => void };
type AfterInteractions = (callback: () => void) => InteractionTask;

const BATCH_DELAY_MS = 400;

/** Coalesce row notifications without interrupting a financial save or a refresh. */
export function createWorkspaceRefreshQueue(
  queryClient: QueryClient,
  workspaceId: string,
  afterInteractions: AfterInteractions,
) {
  let pending = false;
  let refreshing = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interactionTask: InteractionTask | undefined;

  // Saves include dependent steps (installments, past payments, reminders). Refreshing
  // their screens between these steps creates a request/render burst. Paused offline
  // mutations must not block updates from other workspace members indefinitely.
  const isSaving = () => queryClient.isMutating({ predicate: (mutation) => !mutation.state.isPaused }) > 0;

  function schedule() {
    if (disposed || !pending || refreshing || timer !== undefined || interactionTask || isSaving()) return;

    // Fixed window, not a timer reset on every event: ongoing team activity still
    // refreshes periodically. The interaction boundary also preserves Fabric safety.
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || isSaving()) return;
      interactionTask = afterInteractions(flush);
    }, BATCH_DELAY_MS);
  }

  function flush() {
    interactionTask = undefined;
    if (disposed || !pending || isSaving()) return;
    pending = false;
    refreshing = true;

    // One prefix covers entities and cross-entity balances/reports. Previously the
    // same queries were invalidated by entity, payment dependencies AND workspace,
    // repeatedly cancelling/restarting requests for each installment notification.
    void queryClient.invalidateQueries({ queryKey: [workspaceId] })
      .catch(() => {
        // Query errors remain in the cache for normal UI/reconnect retry handling.
      })
      .finally(() => {
        refreshing = false;
        // Events received during this fetch need a trailing refresh: its response
        // may reflect a snapshot taken before those changes.
        schedule();
      });
  }

  const unsubscribeMutations = queryClient.getMutationCache().subscribe(schedule);

  return {
    enqueue() {
      if (disposed) return;
      pending = true;
      schedule();
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== undefined) clearTimeout(timer);
      interactionTask?.cancel();
      unsubscribeMutations();
    },
  };
}
