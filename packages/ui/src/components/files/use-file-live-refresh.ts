"use client";

import { useEffect, useRef, useState } from "react";
import { useSubscription } from "@apollo/client/react";
import { FILE_ENTRY_EVENT } from "@repo/queries/files/file-subscriptions";

/**
 * Refreshes the file tree when the backend publishes a change and exposes a
 * short-lived status notice for the page.
 */
export function useFileLiveRefresh(refetch: () => Promise<unknown>) {
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File mutations and indexing run in the backend process, so the tree is
  // refreshed from a subscription instead of polling. Coalesce bursts (an
  // upload or folder indexing emits one event per file).
  useSubscription(FILE_ENTRY_EVENT, {
    onData: ({ data }) => {
      const event = data.data?.fileEntryEvent;
      if (!event) return;

      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        void refetch();
      }, 250);

      setLiveNotice(
        event.type === "indexed"
          ? "File tree updated after indexing."
          : "Files updated live.",
      );

      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => {
        noticeTimerRef.current = null;
        setLiveNotice(null);
      }, 4000);
    },
  });

  useEffect(
    () => () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  return liveNotice;
}
