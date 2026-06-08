const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  const { data } = await res.json() as { data: T }
  return data
}

interface LoginResult {
  token: string
  user: { id: number; name: string | null; role: string }
}

interface StudentData {
  id: number
  name: string | null
  email: string
  role: string
  profile: {
    weightedGpa: number
    unweightedGpa: number
    gradeLevel: number
    graduationYear: number
    futureDecision: string | null
    satScore: number | null
    actScore: number | null
    counselorName: string | null
  } | null
  courses: Array<{
    id: number
    name: string
    teacher: string
    period: number
    courseType: string
    semester: string
    creditHours: number
    grade: { letterGrade: string; percentage: number } | null
  }>
  assignments: Array<{
    id: number
    title: string
    subject: string
    dueDate: string
    estimatedMinutes: number
    completed: boolean
    completedAt: string | null
  }>
  stats: {
    totalCourses: number
    pendingAssignments: number
    assignmentsDueToday: number
    assignmentsDueThisWeek: number
  }
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<StudentData>('/api/students/me'),
  roadmap: () => request<{
    gradeLevel: number
    creditsCompleted: number
    creditsRequired: number
    percentComplete: number
    weightedGpa: number
    unweightedGpa: number
    futureDecision: string | null
  }>('/api/roadmap'),
  chat: (message: string) =>
    request<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  studyPlan: () => request<{
    plan: Array<{
      id: number
      title: string
      subject: string
      dueDate: string
      estimatedMinutes: number
      priority: string
    }>
  }>('/api/ai/study-plan'),
}

export type { StudentData }
