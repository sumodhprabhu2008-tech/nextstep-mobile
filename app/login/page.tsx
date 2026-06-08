'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await api.login(email, password)
      localStorage.setItem('ns_token', result.token)
      localStorage.setItem('ns_user', JSON.stringify(result.user))
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="/"><img src="/logo.jpg" alt="NextStep" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 16 }} /></a>
        <h1 style={styles.heading}>NextStep</h1>
        <p style={styles.subheading}>Your academic companion</p>

        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="student@slhs.edu"
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            style={{ ...styles.btn, opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p style={styles.hint}>
          Test: <code>test@nextstep.com</code> / <code>nextstep123</code>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', padding: '20px',
  },
  card: {
    width: '100%', maxWidth: '400px', background: 'var(--surface)',
    border: '2px solid var(--border)', borderRadius: '16px', padding: '40px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  logo: {
    width: '64px', height: '64px', borderRadius: '18px', background: 'var(--primary)',
    color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '34px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '16px',
  },
  heading: { fontSize: '32px', fontWeight: '700', color: 'var(--primary)', marginBottom: '6px' },
  subheading: { color: 'var(--text-secondary)', marginBottom: '32px' },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' },
  input: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '12px 14px', color: 'var(--text)', height: '48px', width: '100%',
    outline: 'none',
  },
  error: { color: 'var(--error)', fontSize: '14px' },
  btn: {
    background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: '8px',
    height: '48px', fontWeight: '600', fontSize: '15px', width: '100%', cursor: 'pointer',
  },
  hint: { marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' },
}
