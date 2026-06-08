'use client'

import { useEffect, useState } from 'react'
import { api, type StudentData } from '../../../lib/api'

type SortKey = 'name' | 'teacher' | 'period' | 'grade' | 'percentage'
type SortDir = 'asc' | 'desc'

const GRADE_COLORS: Record<string, string> = {
  A: '#3FB950', B: '#00C896', C: '#D29922', D: '#F0883E', F: '#F85149',
}

function gradeColor(letter: string) {
  return GRADE_COLORS[letter.charAt(0).toUpperCase()] ?? 'var(--text-muted)'
}

export default function GradesPage() {
  const [data, setData] = useState<StudentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('period')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    api.me().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed'))
  }, [])

  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>
  if (!data) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  const uGpa = (data.profile?.unweightedGpa ?? 0).toFixed(2)
  const wGpa = (data.profile?.weightedGpa ?? 0).toFixed(2)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...data.courses].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (sortKey === 'name') { va = a.name; vb = b.name }
    else if (sortKey === 'teacher') { va = a.teacher; vb = b.teacher }
    else if (sortKey === 'period') { va = a.period; vb = b.period }
    else if (sortKey === 'grade') { va = a.grade?.letterGrade ?? 'Z'; vb = b.grade?.letterGrade ?? 'Z' }
    else if (sortKey === 'percentage') { va = a.grade?.percentage ?? -1; vb = b.grade?.percentage ?? -1 }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th style={{ ...styles.th, cursor: 'pointer', color: active ? 'var(--primary)' : 'var(--text-secondary)' }}
        onClick={() => handleSort(k)}>
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px' }}>Grades</h1>

      {/* GPA summary */}
      <div style={{ ...styles.card, display: 'flex', gap: '32px', marginBottom: '24px' }}>
        <div>
          <div style={styles.gpaLabel}>Unweighted GPA</div>
          <div style={{ fontSize: '32px', fontWeight: '700' }}>{uGpa}</div>
        </div>
        <div style={styles.divider} />
        <div>
          <div style={styles.gpaLabel}>Weighted GPA</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--primary)' }}>{wGpa}</div>
        </div>
        <div style={styles.divider} />
        <div>
          <div style={styles.gpaLabel}>Total Courses</div>
          <div style={{ fontSize: '32px', fontWeight: '700' }}>{data.courses.length}</div>
        </div>
      </div>

      {/* Grades table */}
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHead}>
              <SortBtn k="name" label="Course" />
              <SortBtn k="teacher" label="Teacher" />
              <SortBtn k="period" label="Period" />
              <th style={styles.th}>Type</th>
              <SortBtn k="grade" label="Grade" />
              <SortBtn k="percentage" label="%" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} style={styles.tableRow}>
                <td style={styles.td}>{c.name}</td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{c.teacher}</td>
                <td style={styles.td}>{c.period}</td>
                <td style={styles.td}>
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
                    background: c.courseType === 'AP' ? 'rgba(88,166,255,0.15)' : c.courseType === 'HONORS' ? 'rgba(188,140,255,0.15)' : 'var(--border)',
                    color: c.courseType === 'AP' ? 'var(--info)' : c.courseType === 'HONORS' ? '#BC8CFF' : 'var(--text-secondary)',
                  }}>
                    {c.courseType}
                  </span>
                </td>
                <td style={styles.td}>
                  {c.grade ? (
                    <span style={{ color: gradeColor(c.grade.letterGrade), fontWeight: '700', fontSize: '16px' }}>
                      {c.grade.letterGrade}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                  {c.grade ? `${c.grade.percentage.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' },
  gpaLabel: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' },
  divider: { width: '1px', background: 'var(--border)', alignSelf: 'stretch' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  tableHead: { borderBottom: '1px solid var(--border)' },
  th: { textAlign: 'left' as const, padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' as const },
  tableRow: { borderBottom: '1px solid var(--border)' },
  td: { padding: '12px', fontSize: '14px' },
}
