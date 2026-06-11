import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { type NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { fetchStudentData, type CourseWithGrade, type StudentData } from '../api/studentApi'
import {
  addSocialComment,
  createSocialPost,
  fetchSocialFeed,
  toggleFollowAuthor,
  toggleSocialLike,
  type SocialComment,
  type SocialPost,
} from '../api/socialApi'
import { getPortalInfo, type PortalInfo } from '../api/portalApi'
import type { AppParamList } from '../navigation/AppNavigator'
import Button from '../components/ui/Button'
import ScreenHeader from '../components/ui/ScreenHeader'
import Text from '../components/ui/Text'
import { colors } from '../constants/colors'

const courseTag = (course: CourseWithGrade): string => `${course.name} • ${course.grade?.letterGrade ?? 'No grade'}`

type FilterOption = 'all' | 'following'

export default function SocialFeedScreen(): React.JSX.Element {
  const navigation = useNavigation<NativeStackNavigationProp<AppParamList>>()
  const { user } = useAuth()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [following, setFollowing] = useState<number[]>([])
  const [studentData, setStudentData] = useState<StudentData | null>(null)
  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null)
  const [postText, setPostText] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [filter, setFilter] = useState<FilterOption>('all')
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const loadSocialFeed = useCallback(async (): Promise<void> => {
    setIsLoading(true)

    try {
      const [feed, student, info] = await Promise.all([
        fetchSocialFeed(),
        fetchStudentData().catch(() => null),
        getPortalInfo().catch(() => null),
      ])
      setPosts(feed.posts)
      setFollowing(feed.following)
      setStudentData(student)
      setPortalInfo(info)
    } catch (error) {
      console.error('LOAD SOCIAL FEED ERROR:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadSocialFeed()
    }, [loadSocialFeed])
  )

  const courseOptions = useMemo(
    () => studentData?.courses.filter(course => course.grade !== null) ?? [],
    [studentData]
  )

  const selectedCourse = useMemo(
    () => courseOptions.find(course => course.id === selectedCourseId) ?? null,
    [courseOptions, selectedCourseId]
  )

  const displayedPosts = useMemo(() => {
    return posts.filter(post => filter === 'all' || following.includes(post.authorId))
  }, [posts, following, filter])

  const handleCreatePost = useCallback(async (): Promise<void> => {
    if (!postText.trim()) return
    setIsSaving(true)

    try {
      await createSocialPost(
        postText.trim(),
        selectedCourse?.name,
        selectedCourse?.grade?.letterGrade,
        selectedCourse?.courseType,
      )
      setFilter('all')
      setPostText('')
      setSelectedCourseId(null)
      void loadSocialFeed()
    } catch (error) {
      console.error('CREATE POST ERROR:', error)
    } finally {
      setIsSaving(false)
    }
  }, [postText, selectedCourse, loadSocialFeed])

  const handleToggleFollow = useCallback(async (authorId: number): Promise<void> => {
    try {
      const result = await toggleFollowAuthor(authorId)
      setFollowing(prev => {
        if (result.following) return [...prev, authorId]
        return prev.filter(id => id !== authorId)
      })
      void loadSocialFeed()
    } catch (error) {
      console.error('FOLLOW TOGGLE ERROR:', error)
    }
  }, [loadSocialFeed])

  const handleToggleLike = useCallback(async (postId: number): Promise<void> => {
    try {
      const result = await toggleSocialLike(postId.toString())
      setPosts(prev => prev.map(post => {
        if (post.id !== postId) return post
        return { ...post, liked: result.liked, likes: result.likes }
      }))
      void loadSocialFeed()
    } catch (error) {
      console.error('LIKE TOGGLE ERROR:', error)
    }
  }, [loadSocialFeed])

  const handleAddComment = useCallback(async (): Promise<void> => {
    if (!activeCommentPostId || !commentText.trim()) return

    try {
      await addSocialComment(activeCommentPostId.toString(), commentText.trim())
      setCommentText('')
      void loadSocialFeed()
    } catch (error) {
      console.error('COMMENT ERROR:', error)
    }
  }, [activeCommentPostId, commentText, loadSocialFeed])

  const handleSelectCourse = useCallback((courseId: number): void => {
    setSelectedCourseId(current => (current === courseId ? null : courseId))
  }, [])

  const handleToggleComments = useCallback((postId: number): void => {
    setActiveCommentPostId(current => (current === postId ? null : postId))
    setCommentText('')
  }, [])

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScreenHeader title="Study Feed" />
        <View style={styles.header}>
          <View style={styles.headerTextGroup}>
            <Text color={colors.textSecondary} style={styles.subtitle}>
              Share grades, follow peers, and comment on progress.
            </Text>
            {portalInfo ? (
              <Text color={colors.textPrimary} style={styles.portalName}>
                Signed in as {portalInfo.name}
              </Text>
            ) : null}
            <View style={styles.filterRow}>
              {(['all', 'following'] as const).map(option => {
                const isActive = filter === option
                return (
                  <Pressable
                    key={option}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setFilter(option)}
                  >
                    <Text style={isActive ? styles.filterTextActive : styles.filterText}>
                      {option === 'all' ? 'All posts' : 'Following'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View style={styles.statsBadge}>
            <Text variant="label" color={colors.primary} style={styles.statsLabel}>
              {following.length} Following
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={displayedPosts}
            keyExtractor={item => item.id.toString()}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.createBox}>
                <Text variant="label" color={colors.textSecondary}>Create post</Text>
                <TextInput
                  style={styles.postInput}
                  value={postText}
                  onChangeText={setPostText}
                  placeholder="Share a grade or study update"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel="New post content"
                />
                {courseOptions.length > 0 ? (
                  <View style={styles.courseList}>
                    {courseOptions.map(course => (
                      <Pressable
                        key={course.id}
                        style={[
                          styles.courseChip,
                          selectedCourse?.id === course.id && styles.courseChipSelected,
                        ]}
                        onPress={() => handleSelectCourse(course.id)}
                      >
                        <Text
                          style={selectedCourse?.id === course.id ? styles.courseChipTextSelected : styles.courseChipText}
                        >
                          {courseTag(course)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text color={colors.textSecondary} style={styles.noteText}>
                    Your current courses will appear here once loaded.
                  </Text>
                )}
                <Button
                  label={isSaving ? 'Posting…' : 'Post update'}
                  onPress={async () => void handleCreatePost()}
                  disabled={!postText.trim() || isSaving}
                />
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text variant="heading">No posts yet</Text>
                <Text color={colors.textSecondary} style={styles.emptyText}>
                  Create your first grade update or switch to following content.
                </Text>
              </View>
            }
            ListFooterComponent={<View style={styles.footerSpacer} />}
            renderItem={({ item }) => (
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Pressable
                  style={styles.authorInfo}
                  onPress={() => navigation.navigate('SocialProfile', { authorId: item.authorId })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.authorName}'s profile`}
                >
                  <Text variant="h3">{item.authorName}</Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.metaText}>
                    {item.createdAt} · {item.subject ?? 'Study'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.followButton}
                  onPress={() => void handleToggleFollow(item.authorId)}
                  accessibilityRole="button"
                  accessibilityLabel={following.includes(item.authorId) ? 'Unfollow author' : 'Follow author'}
                >
                    <Text color={following.includes(item.authorId) ? colors.textPrimary : colors.primary} style={styles.followButtonText}>
                      {following.includes(item.authorId) ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.postBody}>{item.body}</Text>
                {item.course && item.grade ? (
                  <View style={styles.courseBadge}>
                    <Text variant="caption" color={colors.textPrimary} style={styles.courseBadgeText}>
                      {item.course} · {item.grade}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.engagementRow}>
                  <View style={styles.engagementGroup}>
                    <Ionicons name="heart" size={16} color={colors.error} />
                    <Text style={styles.engagementText}>{item.likes}</Text>
                  </View>
                  <View style={styles.engagementGroup}>
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.textMuted} />
                    <Text style={styles.engagementText}>{item.comments.length}</Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.actionItem}
                    onPress={() => void handleToggleLike(item.id)}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={item.liked ? 'heart' : 'heart-outline'}
                      size={18}
                      color={item.liked ? colors.error : colors.textPrimary}
                    />
                    <Text style={styles.actionLabel}>{item.liked ? 'Liked' : 'Like'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionItem}
                    onPress={() => handleToggleComments(item.id)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
                    <Text style={styles.actionLabel}>Comment</Text>
                  </Pressable>
                </View>

                {activeCommentPostId === item.id ? (
                  <View style={styles.commentSection}>
                    {item.comments.map(comment => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Text variant="caption" color={colors.textPrimary} style={styles.commentAuthor}>
                          {comment.authorName}
                        </Text>
                        <Text style={styles.commentText}>{comment.content}</Text>
                      </View>
                    ))}
                    <View style={styles.commentInputRow}>
                      <TextInput
                        style={styles.commentInput}
                        value={commentText}
                        onChangeText={setCommentText}
                        placeholder="Write a comment"
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel="Comment text"
                      />
                      <Pressable
                        style={[styles.commentSubmit, { opacity: commentText.trim() ? 1 : 0.45 }]}
                        onPress={async () => void handleAddComment()}
                        disabled={!commentText.trim()}
                        accessibilityRole="button"
                        accessibilityLabel="Post comment"
                      >
                        <Ionicons name="send" size={18} color={colors.background} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            )}
            contentContainerStyle={styles.feedContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTextGroup: { flex: 1, gap: 8 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { fontSize: 12, color: colors.textSecondary },
  filterTextActive: { fontSize: 12, color: colors.background, fontWeight: '600' },
  subtitle: { marginTop: 6, lineHeight: 22 },
  portalName: { marginTop: 8, fontSize: 13 },
  statsBadge: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statsLabel: { letterSpacing: 0.4 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createBox: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  postInput: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    padding: 12,
    marginTop: 12,
    textAlignVertical: 'top',
  },
  courseList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  courseChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: colors.border,
  },
  courseChipSelected: {
    backgroundColor: colors.primary,
  },
  courseChipText: { fontSize: 12, color: colors.textPrimary },
  courseChipTextSelected: { fontSize: 12, color: colors.background, fontWeight: '600' },
  noteText: { marginTop: 12, fontSize: 13 },
  feedContent: { paddingBottom: 24 },
  emptyState: { marginTop: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { marginTop: 8, textAlign: 'center', lineHeight: 20 },
  footerSpacer: { height: 24 },
  postCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorInfo: {
    flex: 1,
    marginRight: 12,
  },
  metaText: { marginTop: 4 },
  followButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followButtonText: { fontSize: 12, fontWeight: '600' },
  postBody: { color: colors.textPrimary, lineHeight: 22, marginBottom: 12 },
  courseBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  courseBadgeText: { letterSpacing: 0.2 },
  engagementRow: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  engagementGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engagementText: { color: colors.textSecondary, fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: { color: colors.textPrimary, fontSize: 13 },
  commentSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 12 },
  commentRow: { marginBottom: 10 },
  commentAuthor: { marginBottom: 2 },
  commentText: { color: colors.textPrimary, lineHeight: 20 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    paddingHorizontal: 12,
  },
  commentSubmit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
