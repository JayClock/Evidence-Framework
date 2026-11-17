import type { EvidenceDesktopApi } from '@evidence-poc/desktop-contracts/ipc';

declare global {
  interface Window {
    evidenceAPI: EvidenceDesktopApi;
  }
}

export {};
