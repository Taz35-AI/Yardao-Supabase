// File: capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yardao.app',
  appName: 'Yardao',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'default',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    Haptics: {},
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  android: {
    allowMixedContent: true,
    // ✅ FIX: Removed captureInput to fix keyboard/backspace lag
    // captureInput: true, // REMOVED - This was causing the input delay
    webContentsDebuggingEnabled: true,
    backgroundColor: '#ffffff',
    useLegacyBridge: false
  }
};

export default config;