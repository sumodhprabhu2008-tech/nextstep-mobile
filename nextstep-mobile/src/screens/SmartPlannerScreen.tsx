import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Text from '../components/ui/Text'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import AssignmentCard, { type CardAccent } from '../components/planner/AssignmentCard'
import SectionHeader from '../components/planner/SectionHeader'
import { colors } from '../constants/colors'
import type { PlanningParamList } from '../navigation/PlanningNavigator'

type NavProp = NativeStackNavigationProp<PlanningParamList>
import {
  fetchAssignments,
  toggleAssignmentComplete,
  type Assignment,
} from '../api/assignmentsApi'
import {
  groupAssignments,
  type SectionKey,
} from '../utils/assignmentGrouper'

// ─── Constants ────────────────────────────────────────────────────────────────

const SKELETON_COUNT = 5

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHeaderDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function sectionAccent(key: SectionKey): CardAccent {
  if (key === 'overdue') return 'overdue'
  if (key === 'today') return 'today'
  return 'none'
}

function sectionAccentColor(key: SectionKey): string | undefined {
  if (key === 'overdue') return colors.error
  if (key === 'today') return colors.warning
  return undefined
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard(): React.JSX.Element {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton width={24} height={24} radius={12} style={styles.skeletonCheck} />
      <View style={styles.skeletonBody}>
        <Skeleton width="65%" height={15} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={11} />
      </View>
      <Skeleton width={52} height={11} />
    </View>
  )
}

function LoadingView(): React.JSX.Element {
  return (
    <View style={styles.loadingContainer}>
      <Skeleton width={72} height={11} style={styles.skeletonSectionLabel} />
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  )
}

// ─── Error / Empty ────────────────────────────────────────────────────────────

function ErrorView({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <View style={styles.centerState}>
      <Text variant="h3" color={colors.error} style={styles.stateTitle}>
        Could Not Load Planner
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.stateMessage}>
        {message}
      </Text>
      <Button label="Try Again" onPress={onRetry} />
    </View>
  )
}

function EmptyView(): React.JSX.Element {
  return (
    <View style={styles.centerState}>
      <Text variant="h2" style={styles.stateTitle}>
        You're all caught up!
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.stateMessage}>
        No assignments due — enjoy your day!
      </Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SmartPlannerScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set())

  const headerDate = useMemo(() => formatHeaderDate(), [])

  const plannerSections = useMemo(
    () => groupAssignments(assignments),
    [assignments],
  )

  const loadAssignments = useCallback(async (refresh: boolean = false): Promise<void> => {
    if (refresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)
    try {
      const data = await fetchAssignments()
      setAssignments(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assignments.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const handleToggle = useCallback(
    async (id: number, completed: boolean): Promise<void> => {
      setTogglingIds((prev) => new Set([...prev, id]))
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, completed, completedAt: completed ? new Date().toISOString() : null }
            : a,
        ),
      )
      try {
        const updated = await toggleAssignmentComplete(id, completed)
        setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)))
      } catch {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, completed: !completed, completedAt: null } : a,
          ),
        )
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [],
  )

  const onCardToggle = useCallback(
    (id: number, completed: boolean): void => {
      void handleToggle(id, completed)
    },
    [handleToggle],
  )

  useEffect(() => {
    void loadAssignments()
  }, [loadAssignments])

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Screen header */}
      <PlannerHeader onCalendar={() => navigation.navigate('Calendar')} date={headerDate} navigation={navigation} />

      {isLoading ? (
        <LoadingView />
      ) : error !== null ? (
        <ErrorView message={error} onRetry={() => void loadAssignments()} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadAssignments(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {plannerSections.length === 0 ? (
            <EmptyView />
          ) : (
            plannerSections.map((section) => {
              const isCompleted = section.key === 'completed'
              const isExpanded = !isCompleted || isCompletedExpanded

              return (
                <View key={section.key} style={styles.section}>
                  <SectionHeader
                    label={section.label}
                    count={section.assignments.length}
                    accentColor={sectionAccentColor(section.key)}
                    isCollapsible={isCompleted}
                    isExpanded={isExpanded}
                    onToggleExpand={() => setIsCompletedExpanded((e) => !e)}
                  />
                  {isExpanded &&
                    section.assignments.map((a) => (
                      <AssignmentCard
                        key={a.id}
                        title={a.title}
                        subject={a.subject}
                        estimatedMinutes={a.estimatedMinutes}
                        dueDate={a.dueDate}
                        completed={a.completed}
                        accent={sectionAccent(section.key)}
                        onToggle={() => onCardToggle(a.id, !a.completed)}
                        isToggling={togglingIds.has(a.id)}
                      />
                    ))}
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

// ─── PlannerHeader ────────────────────────────────────────────────────────────

import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp as NSNP } from '@react-navigation/native-stack'

function PlannerHeader({ onCalendar, date, navigation }: { onCalendar: () => void; date: string; navigation: NSNP<PlanningParamList> }): React.JSX.Element {
  const insets = useSafeAreaInsets()
  return (
    <View style={[plannerHeaderStyles.container, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={plannerHeaderStyles.backBtn}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={colors.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text variant="heading">Planner</Text>
        <Text variant="caption" color={colors.textSecondary}>{date}</Text>
      </View>
      <TouchableOpacity
        style={plannerHeaderStyles.calendarBtn}
        onPress={onCalendar}
        accessibilityRole="button"
        accessibilityLabel="Calendar view"
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={22} color={colors.primary} />
      </TouchableOpacity>
    </View>
  )
}

const plannerHeaderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  calendarBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 4,
  },

  // Loading skeleton
  loadingContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  skeletonSectionLabel: {
    marginTop: 20,
    marginBottom: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  skeletonCheck: {
    marginRight: 12,
    flexShrink: 0,
  },
  skeletonBody: {
    flex: 1,
    marginRight: 12,
  },

  // States
  centerState: {
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  stateTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  stateMessage: {
    textAlign: 'center' as const,
    marginBottom: 24,
  },
})
