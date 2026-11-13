import type { Provider } from './api.ts';

export const PROVIDER_NAMES: Record<Provider['id'], string> = { claude: 'Claude', copilot: 'Microsoft 365 Copilot' };
const SETUP: Record<Provider['id'], string> = {
  claude: 'set ANTHROPIC_API_KEY',
  copilot: 'set COPILOT_CLIENT_ID (see the README, Microsoft 365 Copilot)',
};

interface Props {
  /** Providers the server offers. */
  providers: Provider[];
  value: Provider['id'];
  onChange(id: Provider['id']): void;
  /** Signed-in Microsoft account, for Copilot. */
  account?: string;
  onSignIn(): void;
  onSignOut(): void;
  disabled: boolean;
}

/**
 * Choose the AI, and sign in to Microsoft for Copilot (URS-AI-023). Both AIs are always listed;
 * one the server is not set up for is shown, disabled, with how to set it up.
 */
export function ProviderPicker({ providers, value, onChange, account, onSignIn, onSignOut, disabled }: Props) {
  const offered = new Set(providers.map((p) => p.id));
  const missing = (Object.keys(PROVIDER_NAMES) as Provider['id'][]).filter((id) => !offered.has(id));
  const hint = missing.length ? `To add ${missing.map((id) => `${PROVIDER_NAMES[id]}, ${SETUP[id]}`).join('; ')} in config.env, then restart JTDDiagrammar.` : 'Which AI to use';
  return (
    <>
      <select className="select" aria-label="AI" title={hint} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Provider['id'])}>
        {(Object.keys(PROVIDER_NAMES) as Provider['id'][]).map((id) => (
          <option key={id} value={id} disabled={!offered.has(id)}>
            {PROVIDER_NAMES[id]}
            {offered.has(id) ? '' : ' (not set up)'}
          </option>
        ))}
      </select>
      {value === 'copilot' &&
        (account ? (
          <button type="button" className="chip" title={`Signed in to Microsoft as ${account}. Click to sign out.`} disabled={disabled} onClick={onSignOut}>
            {account.split(' ')[0]}
          </button>
        ) : (
          <button type="button" className="chip" aria-label="Sign in with Microsoft" title="Sign in with Microsoft" disabled={disabled} onClick={onSignIn}>
            Sign in
          </button>
        ))}
    </>
  );
}
