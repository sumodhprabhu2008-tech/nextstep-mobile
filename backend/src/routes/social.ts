import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const RECENT_POST_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

router.get('/feed', requireAuth, async (req: AuthRequest, res) => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }

  try {
    const followingRecords = await prisma.follow.findMany({
      where: { followerId: req.userId },
      select: { followingId: true },
    })
    const following = followingRecords.map(item => item.followingId)

    const likedRecords = await prisma.socialLike.findMany({
      where: { userId: req.userId },
      select: { postId: true },
    })
    const likedPostIds = new Set(likedRecords.map(item => item.postId))

    const thresholdDate = new Date(Date.now() - RECENT_POST_THRESHOLD_MS)

    const posts = await prisma.post.findMany({
      where: { createdAt: { gte: thresholdDate } },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true } } },
        },
        _count: { select: { likes: true } },
      },
    })

    const formatted = posts.map(post => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.name ?? 'Unknown',
      body: post.body,
      course: post.course ?? undefined,
      subject: post.subject ?? undefined,
      grade: post.grade ?? undefined,
      createdAt: post.createdAt.toISOString(),
      likes: post._count.likes,
      liked: likedPostIds.has(post.id),
      comments: post.comments.map(comment => ({
        id: comment.id,
        authorId: comment.authorId,
        authorName: comment.author.name ?? 'Unknown',
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
      })),
    }))

    res.json({ data: { posts: formatted, following } })
  } catch (error) {
    console.error('SOCIAL FEED ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.get('/users/:authorId', requireAuth, async (req: AuthRequest, res) => {
  const authorId = Number(req.params.authorId)

  if (!Number.isInteger(authorId)) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid author ID' } })
    return
  }

  try {
    const thresholdDate = new Date(Date.now() - RECENT_POST_THRESHOLD_MS)

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        name: true,
        posts: {
          where: { createdAt: { gte: thresholdDate } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            body: true,
            subject: true,
            grade: true,
            createdAt: true,
            _count: { select: { likes: true, comments: true } },
          },
        },
        _count: { select: { followers: true, following: true, posts: true } },
      },
    })

    if (!author) {
      res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Author not found' } })
      return
    }

    const userId = req.userId!
    const following = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: authorId } },
    })

    const totalLikes = await prisma.socialLike.count({
      where: {
        post: {
          authorId,
        },
      },
    })

    res.json({
      data: {
        authorId: author.id,
        authorName: author.name ?? 'Unknown',
        following: Boolean(following),
        followerCount: author._count.followers,
        followingCount: author._count.following,
        postCount: author._count.posts,
        totalLikes,
        posts: author.posts.map(post => ({
          id: post.id,
          body: post.body,
          subject: post.subject ?? undefined,
          grade: post.grade ?? undefined,
          createdAt: post.createdAt.toISOString(),
          likes: post._count.likes,
          commentCount: post._count.comments,
        })),
      },
    })
  } catch (error) {
    console.error('SOCIAL PROFILE ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.post('/posts', requireAuth, async (req: AuthRequest, res) => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }

  const { body, course, grade, subject } = req.body as {
    body?: string
    course?: string
    grade?: string
    subject?: string
  }

  if (!body?.trim()) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Post body is required' } })
    return
  }

  try {
    const post = await prisma.post.create({
      data: {
        authorId: req.userId,
        body: body.trim(),
        course: course?.trim() || null,
        grade: grade?.trim() || null,
        subject: subject?.trim() || null,
      },
      include: { author: { select: { id: true, name: true } } },
    })

    res.status(201).json({
      data: {
        id: post.id,
        authorId: post.authorId,
        authorName: post.author.name ?? 'Unknown',
        body: post.body,
        course: post.course ?? undefined,
        subject: post.subject ?? undefined,
        grade: post.grade ?? undefined,
        createdAt: post.createdAt.toISOString(),
        likes: 0,
        liked: false,
        comments: [],
      },
    })
  } catch (error) {
    console.error('CREATE POST ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.post('/posts/:postId/like', requireAuth, async (req: AuthRequest, res) => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }

  const postId = Number(req.params.postId)
  if (!Number.isInteger(postId)) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid post ID' } })
    return
  }

  try {
    const existing = await prisma.socialLike.findUnique({
      where: { postId_userId: { postId, userId: req.userId } },
    })

    let liked = false
    if (existing) {
      await prisma.socialLike.delete({ where: { id: existing.id } })
    } else {
      await prisma.socialLike.create({ data: { postId, userId: req.userId } })
      liked = true
    }

    const count = await prisma.socialLike.count({ where: { postId } })

    res.json({ data: { liked, likes: count } })
  } catch (error) {
    console.error('TOGGLE LIKE ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.post('/posts/:postId/comments', requireAuth, async (req: AuthRequest, res) => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }

  const postId = Number(req.params.postId)
  const { content } = req.body as { content?: string }

  if (!Number.isInteger(postId) || !content?.trim()) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } })
    return
  }

  try {
    const comment = await prisma.socialComment.create({
      data: {
        postId,
        authorId: req.userId,
        content: content.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    })

    res.status(201).json({
      data: {
        id: comment.id,
        authorId: comment.authorId,
        authorName: comment.author.name ?? 'Unknown',
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('ADD COMMENT ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

router.post('/follow/:authorId', requireAuth, async (req: AuthRequest, res) => {
  if (req.userId === undefined) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    return
  }

  const authorId = Number(req.params.authorId)
  if (!Number.isInteger(authorId) || authorId === req.userId) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid author ID' } })
    return
  }

  try {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: req.userId, followingId: authorId } },
    })

    let following = false
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } })
    } else {
      await prisma.follow.create({ data: { followerId: req.userId, followingId: authorId } })
      following = true
    }

    res.json({ data: { following } })
  } catch (error) {
    console.error('TOGGLE FOLLOW ERROR:', error)
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
})

export default router
