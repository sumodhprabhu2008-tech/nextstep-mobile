import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { fetchAuthorProfile, toggleFollowAuthor, type SocialProfile } from '../api/socialApi'
import type { AppParamList } from '../navigation/AppNavigator'
import ScreenHeader from '../components/ui/ScreenHeader'
import Button from '../components/ui/Button'
import Text from '../components/ui/Text'
import { colors } from '../constants/colors'

type SocialProfileRouteProp = RouteProp<AppParamList, 'SocialProfile'>

export default function SocialProfileScreen(): React.JSX.Element {
  const route = useRoute<SocialProfileRouteProp>()
  const { authorId } = route.params
  const { user } = useAuth()

  const [profile, setProfile] = useState<SocialProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchAuthorProfile(authorId)
      setProfile(data)
    } catch (err) {
      console.error('LOAD PROFILE ERROR:', err)
      setError('Unable to load profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [authorId])

  useFocusEffect(
    useCallback(() => {
      void loadProfile()
    }, [loadProfile])
  )

  const handleToggleFollow = useCallback(async (): Promise<void> => {
    if (!profile || authorId === user?.id) return
    setIsSaving(true)

    try {
      await toggleFollowAuthor(authorId)
      void loadProfile()
    } catch (err) {
      console.error('FOLLOW PROFILE ERROR:', err)
    } finally {
      setIsSaving(false)
    }
  }, [authorId, loadProfile, profile, user?.id])

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Profile" />
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Profile" />
        <View style={styles.emptyState}>
          <Text variant="heading">Profile not found</Text>
          <Text color={colors.textSecondary} style={styles.emptyText}>{error ?? 'This user may no longer exist.'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title={profile.authorName} />
      <View style={styles.profileHeader}>
        <View style={styles.profileStatItem}>
          <Text variant="label" color={colors.textSecondary}>Followers</Text>
          <Text variant="h2" style={styles.counter}>{profile.followerCount}</Text>
        </View>
        <View style={styles.profileStatItem}>
          <Text variant="label" color={colors.textSecondary}>Following</Text>
          <Text variant="h2" style={styles.counter}>{profile.followingCount}</Text>
        </View>
        <View style={styles.profileStatItem}>
          <Text variant="label" color={colors.textSecondary}>Posts</Text>
          <Text variant="h2" style={styles.counter}>{profile.postCount}</Text>
        </View>
        <View style={styles.profileStatItem}>
          <Text variant="label" color={colors.textSecondary}>Total likes</Text>
          <Text variant="h2" style={styles.counter}>{profile.totalLikes}</Text>
        </View>
      </View>

      {authorId !== user?.id ? (
        <View style={styles.followRow}>
          <Button
            label={profile.following ? 'Following' : 'Follow'}
            onPress={async () => void handleToggleFollow()}
            disabled={isSaving}
          />
        </View>
      ) : (
        <View style={styles.followRow}>
          <Text color={colors.textSecondary}>This is your profile.</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text variant="label">Recent posts</Text>
      </View>

      <FlatList
        data={profile.posts}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text variant="heading">No posts yet</Text>
            <Text color={colors.textSecondary} style={styles.emptyText}>
              This user hasn't shared a study update yet.
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              <Text variant="caption" color={colors.textSecondary}>{item.createdAt}</Text>
            </View>
            <Text style={styles.postBody}>{item.body}</Text>
            {item.subject || item.grade ? (
              <View style={styles.courseBadge}>
                <Text variant="caption" color={colors.textPrimary} style={styles.courseBadgeText}>
                  {item.subject ?? 'Study'}{item.grade ? ` · ${item.grade}` : ''}
                </Text>
              </View>
            ) : null}
            <View style={styles.statsRow}>
              <Text color={colors.textSecondary}>{item.likes} likes</Text>
              <Text color={colors.textSecondary}>{item.commentCount} comments</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileStatItem: {
    width: '48%',
    marginBottom: 16,
  },
  counter: { marginTop: 4 },
  followRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
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
    marginBottom: 10,
  },
  postBody: {
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  courseBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  courseBadgeText: { letterSpacing: 0.2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feedContent: { paddingBottom: 24 },
  emptyState: { marginTop: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { marginTop: 8, textAlign: 'center', lineHeight: 20 },
})
