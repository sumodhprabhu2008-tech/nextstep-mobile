import { apiFetch } from '../utils/api'

export interface StudyPlanItem {
  id: number
  title: string
  subject: string
  dueDate: string
  estimatedMinutes: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface ChatResponse {
  data: { reply: string }
}

interface StudyPlanResponse {
  data: { plan: StudyPlanItem[] }
}

export async function sendChatMessage(message: string): Promise<string> {
  const res = await apiFetch<ChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
  return res.data.reply
}

export async function fetchStudyPlan(): Promise<StudyPlanItem[]> {
  const res = await apiFetch<StudyPlanResponse>('/api/ai/study-plan')
  return res.data.plan
}
