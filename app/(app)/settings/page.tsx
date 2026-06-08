'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, type StudentData } from '../../../lib/api'

function initials(name: string | null): string {
  if (!name) return 'S'
  return name.trim().split(' ').map(p => p.charAt(0).toUpperCase()).join('').slice(0, 2)
}

export default function SettingsPage() {
  const router = useRouter()
  const [data, setData] = useState<StudentData | null>(null)

  useEffect(() => {
    api.me().then(setData).catch(() => null)
  }, [])

  function handleLogout() {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_user')
    router.push('/login')
  }

  const profile = data?.profile ?? null

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px' }}>Settings</h1>
      <div style={styles.layout}>
        {/* Left column */}
        <div style={{ flex: 1 }}>
          {/* Profile card */}
          <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', marginBottom: '20px' }}>
            <div style={styles.avatar}>{initials(data?.name ?? null)}</div>
            <div style={styles.name}>{data?.name ?? 'Student'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              {[profile?.gradeLevel ? `Grade ${profile.gradeLevel}` : '', profile?.graduationYear ? `Class of ${profile.graduationYear}` : ''].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Academic info */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Academic Info</div>
            <InfoRow label="SAT Score" value={profile?.satScore?.toString() ?? 'Not set'} />
            <InfoRow label="ACT Score" value={profile?.actScore?.toString() ?? 'Not set'} />
            <InfoRow label="Future Plan" value={profile?.futureDecision ?? 'Not set'} />
            <InfoRow label="Counselor" value={profile?.counselorName ?? 'Unassigned'} />
            <InfoRow label="Graduation Year" value={profile?.graduationYear?.toString() ?? '—'} />
          </div>
        </div>

        {/* Right column */}
        <div style={{ flex: 1 }}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Appearance</div>
            <InfoRow label="Color Theme" value="Dark" />
            <InfoRow label="Color Coding" value="Enabled" />
          </div>

          <div style={{ ...styles.card, marginTop: '16px' }}>
            <div style={styles.cardTitle}>Support</div>
            <InfoRow label="Contact Support" value="support@nextstep.ai" />
            <InfoRow label="Version" value="v1.0.0 MVP" />
          </div>

          <button style={styles.logoutBtn} onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoRow}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{label}</span>
      <span style={{ fontSize: '14px' }}>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', gap: '24px', alignItems: 'flex-start' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  cardTitle: { fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: '16px' },
  avatar: { width: '72px', height: '72px', borderRadius: '36px', background: 'var(--primary)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', marginBottom: '12px' },
  name: { fontSize: '20px', fontWeight: '700', marginBottom: '4px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  logoutBtn: { width: '100%', background: 'transparent', border: 'none', color: 'var(--error)', fontSize: '16px', fontWeight: '700', padding: '16px', textAlign: 'center' as const, marginTop: '8px' },
}
