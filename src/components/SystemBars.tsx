// File: src/components/SystemBars.tsx
'use client';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { logger } from '@/lib/logger'

export default function SystemBars() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        // Prevent status bar from overlapping content
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch (error) {
        logger.log('StatusBar not available:', error);
      }
    })();
  }, []);

  return null;
}