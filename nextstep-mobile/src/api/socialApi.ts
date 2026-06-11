import { apiFetch } from '../utils/api'

export interface SocialComment {
  id: number
  authorId: number
  authorName: string
  content: string
  createdAt: string
}

export interface SocialPost {
  id: number
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

export interface SocialFeedResponse {
  posts: SocialPost[]
  following: number[]
}

export interface SocialPostPreview {
  id: number
  body: string
  subject?: string
  grade?: string
  createdAt: string
  likes: number
  commentCount: number
}

export interface SocialProfile {
  authorId: number
  authorName: string
  following: boolean
  followerCount: number
  followingCount: number
  postCount: number
  totalLikes: number
  posts: SocialPostPreview[]
}

export async function fetchSocialFeed(): Promise<SocialFeedResponse> {
  const res = await apiFetch<{ data: SocialFeedResponse }>('/social/feed')
  return res.data
}

export async function createSocialPost(
  body: string,
  course?: string,
  grade?: string,
  subject?: string,
): Promise<SocialPost> {
  const res = await apiFetch<{ data: SocialPost }>('/social/posts', {
    method: 'POST',
    body: JSON.stringify({ body, course, grade, subject }),
  })
  return res.data
}

export async function toggleSocialLike(postId: string): Promise<{ liked: boolean; likes: number }> {
  const res = await apiFetch<{ data: { liked: boolean; likes: number } }>(`/social/posts/${postId}/like`, {
    method: 'POST',
  })
  return res.data
}

export async function addSocialComment(postId: string, content: string): Promise<SocialComment> {
  const res = await apiFetch<{ data: SocialComment }>(`/social/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  return res.data
}

export async function fetchAuthorProfile(authorId: number): Promise<SocialProfile> {
  const res = await apiFetch<{ data: SocialProfile }>(`/social/users/${authorId}`)
  return res.data
}

export async function toggleFollowAuthor(authorId: number): Promise<{ following: boolean }> {
  const res = await apiFetch<{ data: { following: boolean } }>(`/social/follow/${authorId}`, {
    method: 'POST',
  })
  return res.data
}
