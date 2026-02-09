import { DesktopUpdatePayload, DesktopUpdateStatus } from '@/types';

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
      onUpdateStatus?: (callback: (payload: any) => void) => () => void;
      checkForUpdates?: () => Promise<DesktopUpdatePayload>;
      downloadUpdate?: () => void;
      installUpdate?: () => Promise<void>;
      quitAndInstall?: () => void;
    };
    gapi?: any;
  }
}
