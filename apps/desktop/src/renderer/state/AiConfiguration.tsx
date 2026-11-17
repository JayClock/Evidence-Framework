import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AiConfigStatus } from '@evidence-poc/desktop-contracts/aiConfig';
import { ModelSettingsModal } from '../components/settings/ModelSettingsModal';

const AiConfigurationContext = createContext<{
  status: AiConfigStatus | null;
  aiConfigured: boolean;
  openSettings: () => void;
} | null>(null);

/** Only the app shell knows IPC; features receive boolean/callback ports. */
export const useAiConfiguration = () => useContext(AiConfigurationContext);
export const AiConfigurationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [open, setOpen] = useState(false);
  const openSettings = useCallback(() => setOpen(true), []);
  useEffect(() => {
    let active = true;
    let changed = false;
    const api = window.evidenceAPI.aiConfig;
    const unsubscribe = api.onChanged((next) => {
      changed = true;
      if (active) setStatus(next);
    });
    void api
      .getStatus()
      .then((next) => {
        if (active && !changed) setStatus(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <AiConfigurationContext.Provider
      value={{
        status,
        aiConfigured: status?.isConfigured === true,
        openSettings,
      }}
    >
      {children}
      {open ? (
        <ModelSettingsModal
          api={window.evidenceAPI.aiConfig}
          status={status}
          onStatus={setStatus}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </AiConfigurationContext.Provider>
  );
};
