import { DesktopUpdatePayload } from '@/types';

export {};

declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      versions: {
        node: () => string;
        chrome: () => string;
        electron: () => string;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onUpdateStatus?: (callback: (payload: any) => void) => () => void;
      checkForUpdates?: () => Promise<DesktopUpdatePayload>;
      getLocalCapabilityToken?: () => Promise<string>;
      openLogsFolder?: () => Promise<{ success: boolean; message?: string }>;
      openUserDataFolder?: () => Promise<{ success: boolean; message?: string }>;
      copyDiagnostics?: () => Promise<{ success: boolean; message?: string }>;
      downloadUpdate?: () => void;
      installUpdate?: () => Promise<void>;
      quitAndInstall?: () => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gapi?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}
