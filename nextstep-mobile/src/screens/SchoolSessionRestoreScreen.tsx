import React, { useCallback } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import ScreenHeader from '../components/ui/ScreenHeader'
import Button from '../components/ui/Button'
import Text from '../components/ui/Text'
import { colors } from '../constants/colors'
import { useSchoolSession } from '../context/SchoolSessionContext'

interface Props {
  onContinue: () => void
  onUseDifferentAccount: () => void
}

export default function SchoolSessionRestoreScreen({
  onContinue,
  onUseDifferentAccount,
}: Props): React.JSX.Element {
  const { schoolInfo, signOut } = useSchoolSession()

  const handleUseDifferent = useCallback(async (): Promise<void> => {
    await signOut()
    onUseDifferentAccount()
  }, [onUseDifferentAccount, signOut])

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Welcome Back" />
      <View style={styles.content}>
        <Text variant="heading">Resume school access</Text>
        <Text color={colors.textSecondary} style={styles.subtitle}>
          We found a saved school session for your district. Continue to resume your app experience
          or switch accounts.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text variant="label">District</Text>
            <Text>{schoolInfo?.district ?? 'Unknown'}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text variant="label">Username</Text>
            <Text>{schoolInfo?.username ?? 'Unknown'}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text variant="label">System</Text>
            <Text>{schoolInfo?.systemType ?? 'HAC'}</Text>
          </View>
        </View>

        <Button label="Continue" onPress={onContinue} />
        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleUseDifferent}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Use a different school account</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 12,
    lineHeight: 22,
  },
  card: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
})
