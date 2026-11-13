import type { Provider } from './api.ts';

export const PROVIDER_NAMES: Record<Provider['id'], string> = { claude: 'Claude', copilot: 'Microsoft 365 Copilot' };

interface Props {
  providers: Provider[];
  value: Provider['id'];
  onChange(id: Provider['id']): void;
  /** Signed-in Microsoft account, for Copilot. */
  account?: string;
  onSignIn(): void;
  onSignOut(): void;
  disabled: boolean;
}

/** Choose the AI, and sign in to Microsoft for Copilot (URS-AI-023). */
export function ProviderPicker({ providers, value, onChange, account, onSignIn, onSignOut, disabled }: Props) {
  return (
    <>
      {providers.length > 1 ? (
        <select className="select" aria-label="AI" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Provider['id'])}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {PROVIDER_NAMES[p.id]}
            </option>
          ))}
        </select>
      ) : null}
      {value === 'copilot' &&
        (account ? (
          <button type="button" className="chip" title={`Signed in to Microsoft as ${account}. Click to sign out.`} disabled={disabled} onClick={onSignOut}>
            {account.split(' ')[0]}
          </button>
        ) : (
          <button type="button" className="chip" disabled={disabled} onClick={onSignIn}>
            Sign in with Microsoft
          </button>
        ))}
    </>
  );
}
