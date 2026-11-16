import { useEffect, useState } from 'react';
import { startUpdate, versionInfo, waitForUpdate, type VersionInfo } from './api.ts';

type Phase = { at: 'idle' } | { at: 'updating'; to: string } | { at: 'failed'; message: string; log?: string };

/**
 * The running version in the toolbar (URS-WEB-022), and, when a newer release is out, a button that
 * updates in place and reloads once the server is back on it (URS-NF-015).
 */
export function VersionBadge() {
  const [info, setInfo] = useState<VersionInfo>();
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  useEffect(() => void versionInfo().then(setInfo), []);
  if (!info) return null;

  const update = async () => {
    if (!window.confirm(`Update JTDDiagrammar from ${info.version} to ${info.latest}?\n\nThe app restarts and this page reloads. Your diagram is kept.`)) return;
    try {
      const { to } = await startUpdate();
      setPhase({ at: 'updating', to });
      const r = await waitForUpdate(to);
      if (r.done) window.location.reload();
      else setPhase({ at: 'failed', message: r.log ? 'The update failed.' : 'The update is taking too long.', ...(r.log && { log: r.log }) });
    } catch (e) {
      setPhase({ at: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <span className="version cluster" aria-live="polite">
      <span className="version__current" title={info.reason ?? (info.latest && !info.updateAvailable ? 'Up to date' : undefined)}>
        {info.version}
      </span>
      {phase.at === 'updating' ? (
        <span className="version__note">Updating to {phase.to}…</span>
      ) : phase.at === 'failed' ? (
        <span className="version__note" data-state="error" title={phase.log ?? phase.message}>
          {phase.message}
        </span>
      ) : info.updateAvailable && info.canUpdate ? (
        <button type="button" className="btn version__update" data-variant="primary" title={`Install ${info.latest} and restart`} onClick={() => void update()}>
          Update to {info.latest}
        </button>
      ) : info.updateAvailable ? (
        <span className="version__note" title={info.reason}>
          {info.latest} available
        </span>
      ) : null}
    </span>
  );
}
