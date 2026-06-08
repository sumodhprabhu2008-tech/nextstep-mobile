import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

// Stub: replace with Anthropic API call when key is available:
// import Anthropic from '@anthropic-ai/sdk'
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const { message } = req.body as { message: string }
    const msg = (message ?? '').toLowerCase()

    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.userId } })
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    const courses = await prisma.course.findMany({
      where: { userId: req.userId },
      include: { grades: { where: { gradingPeriod: 'CURRENT' }, take: 1 } },
    })
    const assignments = await prisma.assignment.findMany({
      where: { userId: req.userId, completed: false },
      orderBy: { dueDate: 'asc' },
      take: 3,
    })

    const firstName = user?.name?.split(' ')[0] ?? 'Student'
    const wGpa = profile?.weightedGpa?.toFixed(2) ?? '—'
    const uGpa = profile?.unweightedGpa?.toFixed(2) ?? '—'

    const sorted = [...courses].sort((a, b) => {
      const ga = a.grades[0]?.percentage ?? 100
      const gb = b.grades[0]?.percentage ?? 100
      return ga - gb
    })
    const weakest = sorted[0]
    const strongest = sorted[sorted.length - 1]

    let reply = `Hi ${firstName}! I'm NextStep AI. Ask me about your grades, GPA, assignments, or college plans.`

    if (msg.includes('gpa')) {
      reply = `Your current GPA is ${uGpa} unweighted and ${wGpa} weighted. ${weakest ? `To boost it, focus on ${weakest.name} — that's your lowest course right now.` : ''}`
    } else if (msg.includes('college') || msg.includes('university')) {
      reply = `Based on your ${uGpa} GPA and your goal of "${profile?.futureDecision ?? 'continuing education'}", you're on a solid path. ${profile?.satScore ? `Your SAT score of ${profile.satScore} is a great start.` : "Consider taking the SAT or ACT if you haven't yet."}`
    } else if (msg.includes('assignment') || msg.includes('homework') || msg.includes('due')) {
      const next = assignments[0]
      reply = next
        ? `Your most urgent assignment is "${next.title}" for ${next.subject}, due ${new Date(next.dueDate).toLocaleDateString()}. Estimated time: ${next.estimatedMinutes} minutes.`
        : `You're all caught up — no pending assignments right now!`
    } else if (msg.includes('grade') || msg.includes('class') || msg.includes('course')) {
      reply = `${strongest ? `Your strongest class is ${strongest.name} at ${strongest.grades[0]?.percentage ?? '—'}%.` : ''} ${weakest ? `You might want to put extra effort into ${weakest.name}.` : ''}`
    } else if (msg.includes('sat') || msg.includes('act') || msg.includes('test')) {
      reply = profile?.satScore
        ? `Your SAT score is ${profile.satScore}. Keep practicing with Khan Academy for free prep resources!`
        : `You haven't entered your SAT/ACT score yet. Head to Settings to add it and get personalized college advice.`
    } else if (msg.includes('study') || msg.includes('help') || msg.includes('advice')) {
      reply = `Here's my advice for you, ${firstName}: prioritize ${weakest?.name ?? 'your weakest subject'}, complete your pending assignments on time, and aim to raise your GPA to ${Math.min(4.0, (profile?.unweightedGpa ?? 3.0) + 0.2).toFixed(1)} by end of semester.`
    } else if (msg.includes('road') || msg.includes('roadmap') || msg.includes('high school')) {
      reply = `You're in grade ${profile?.gradeLevel ?? '?'}. ${profile?.gradeLevel === 11 ? 'Now is the perfect time to prep for SAT/ACT and research colleges!' : profile?.gradeLevel === 12 ? 'Focus on college applications and finishing strong!' : 'Keep building strong grades and explore your interests.'}`
    }

    res.json({ data: { reply } })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.get('/study-plan', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }
  try {
    const assignments = await prisma.assignment.findMany({
      where: { userId: req.userId, completed: false },
      orderBy: { dueDate: 'asc' },
      take: 5,
    })

    const now = new Date()
    const plan = assignments.map(a => {
      const daysUntil = (a.dueDate.getTime() - now.getTime()) / 86400000
      const priority = daysUntil <= 1 ? 'HIGH' : daysUntil <= 3 ? 'MEDIUM' : 'LOW'
      return {
        id: a.id,
        title: a.title,
        subject: a.subject,
        dueDate: a.dueDate,
        estimatedMinutes: a.estimatedMinutes,
        priority,
      }
    })

    res.json({ data: { plan } })
  } catch {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

export default router
