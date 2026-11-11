import type { EvidenceDesktopApi } from '../../shared/ipc';

declare global {
  interface Window {
    evidenceAPI: EvidenceDesktopApi;
  }
}

export {};
