import { useState } from 'react';
import { ui } from '../../lib/theme';

interface LoginFormProps {
  needsSetup: boolean;
  onSuccess: () => void;
}

export function LoginForm({ needsSetup, onSuccess }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    const endpoint = needsSetup ? '/api/v1/auth/setup' : '/api/v1/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json();
      setError(data.error || 'Authentication failed');
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: ui.terminalBg,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '320px',
      }}>
        <div style={{
          color: ui.textPrimary,
          fontSize: '20px',
          fontWeight: 600,
          textAlign: 'center',
          marginBottom: '8px',
        }}>
          GhostTerm
        </div>

        <div style={{
          color: ui.textSecondary,
          fontSize: '13px',
          textAlign: 'center',
        }}>
          {needsSetup ? 'Set a password to secure your terminal.' : 'Enter your password to continue.'}
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={needsSetup ? 'Choose a password' : 'Password'}
          autoFocus
          style={{
            backgroundColor: ui.tabActiveBg,
            border: `1px solid ${ui.sidebarBorder}`,
            color: ui.textPrimary,
            fontSize: '14px',
            fontFamily: 'inherit',
            padding: '10px 12px',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ color: ui.danger, fontSize: '12px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            backgroundColor: ui.accent,
            border: 'none',
            color: '#fff',
            fontSize: '13px',
            fontFamily: 'inherit',
            fontWeight: 600,
            padding: '10px',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading || !password ? 0.6 : 1,
          }}
        >
          {needsSetup ? 'Set Password' : 'Login'}
        </button>
      </form>
    </div>
  );
}
