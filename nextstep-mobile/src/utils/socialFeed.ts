import AsyncStorage from '@react-native-async-storage/async-storage'

export interface SocialComment {
  id: string
  authorId: number
  authorName: string
  content: string
  createdAt: string
}

export interface SocialPost {
  id: string
  authorId: number
  authorName: string
  body: string
  course?: string
  subject?: string
  grade?: string
  createdAt: string
  likes: number
  liked: boolean
  comments: SocialComment[]
}

export interface SocialState {
  posts: SocialPost[]
  following: number[]
}

const STORAGE_KEY = 'nextstep_social_feed'

const SAMPLE_POSTS: SocialPost[] = [
  {
    id: 'post-1',
    authorId: 101,
    authorName: 'Ava J.',
    body: 'Just finished a chemistry lab report and got an A! Anyone want to study together for next week’s test?',
    course: 'Chemistry',
    subject: 'Science',
    grade: 'A',
    createdAt: '2h ago',
    likes: 18,
    liked: false,
    comments: [
      {
        id: 'comment-1',
        authorId: 102,
        authorName: 'Noah K.',
        content: 'Nice work! I’m in for study group on Thursday.',
        createdAt: '1h ago',
      },
    ],
  },
  {
    id: 'post-2',
    authorId: 102,
    authorName: 'Noah K.',
    body: 'Math quiz score just posted. A little stressed but happy with an A-.',
    course: 'Algebra II',
    subject: 'Math',
    grade: 'A-',
    createdAt: '4h ago',
    likes: 9,
    liked: false,
    comments: [
      {
        id: 'comment-2',
        authorId: 103,
        authorName: 'Mia S.',
        content: 'Nice! Want to review the last section together?',
        createdAt: '3h ago',
      },
    ],
  },
  {
    id: 'post-3',
    authorId: 103,
    authorName: 'Mia S.',
    body: 'Senior year is wild. Sharing my planner with mini goals for the week — stay focused!',
    course: 'English Literature',
    subject: 'ELA',
    grade: 'A',
    createdAt: '6h ago',
    likes: 23,
    liked: false,
    comments: [],
  },
]

const DEFAULT_STATE: SocialState = {
  posts: SAMPLE_POSTS,
  following: [101],
}

export async function loadSocialFeed(): Promise<SocialState> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored) as SocialState
    if (!parsed?.posts || !Array.isArray(parsed.posts)) return DEFAULT_STATE
    return parsed
  } catch {
    return DEFAULT_STATE
  }
}

export async function saveSocialFeed(state: SocialState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function createSocialPost(
  authorId: number,
  authorName: string,
  body: string,
  course?: string,
  grade?: string,
  subject?: string
): SocialPost {
  return {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    authorId,
    authorName,
    body,
    course,
    subject,
    grade,
    createdAt: 'Just now',
    likes: 0,
    liked: false,
    comments: [],
  }
}
