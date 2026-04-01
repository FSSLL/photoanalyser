import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { useColors } from "@/hooks/useColors";

function SettingsRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed && onPress ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.destructive + "18" : colors.accent }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, { color: danger ? colors.destructive : colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    permission,
    requestPermission,
    indexStatus,
    indexPhotos,
    cloudEnabled,
    setCloudEnabled,
    reviewBeforeDelete,
    setReviewBeforeDelete,
    photos,
    aiProgress,
    analyzeAllWithAI,
    cancelAIAnalysis,
  } = usePhotoLibrary();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const permissionLabel =
    permission === "granted"
      ? "Full Access"
      : permission === "limited"
      ? "Limited Access"
      : permission === "denied"
      ? "Denied"
      : "Not Requested";

  const permissionColor =
    permission === "granted"
      ? colors.success
      : permission === "limited"
      ? colors.warning
      : colors.destructive;

  const indexProgress =
    indexStatus.total > 0 ? Math.round((indexStatus.indexed / indexStatus.total) * 100) : 0;

  const estimatedStorageMB = Math.round((photos.length * 4.2) / 1000);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 30 }}
    >
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      {/* Photo Access */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PHOTO ACCESS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="image"
          title="Library Access"
          subtitle={permissionLabel}
          right={
            <View style={[styles.badge, { backgroundColor: permissionColor + "22" }]}>
              <Text style={[styles.badgeText, { color: permissionColor }]}>{permissionLabel}</Text>
            </View>
          }
          onPress={permission !== "granted" ? requestPermission : undefined}
        />
        {permission === "limited" && (
          <SettingsRow
            icon="unlock"
            title="Expand Access"
            subtitle="Select more photos or grant full access"
            onPress={requestPermission}
          />
        )}
        {permission === "denied" && (
          <SettingsRow
            icon="settings"
            title="Open Settings"
            subtitle="Enable photo access in your device Settings"
            onPress={requestPermission}
          />
        )}
      </View>

      {/* Index */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SEARCH INDEX</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="database"
          title="Index Status"
          subtitle={
            indexStatus.isIndexing
              ? `Indexing... ${indexProgress}%`
              : indexStatus.lastIndexed
              ? `${indexStatus.indexed} of ${indexStatus.total} photos indexed`
              : `${photos.length} photos loaded`
          }
          right={
            indexStatus.isIndexing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : undefined
          }
        />
        {indexStatus.isIndexing && indexStatus.total > 0 && (
          <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${indexProgress}%` as any },
              ]}
            />
          </View>
        )}
        <SettingsRow
          icon="refresh-cw"
          title="Re-index Library"
          subtitle="Scan all photos for better search results"
          onPress={indexStatus.isIndexing ? undefined : indexPhotos}
        />
        <SettingsRow
          icon="hard-drive"
          title="Index Storage"
          subtitle={`~${estimatedStorageMB} MB estimated`}
        />
        {indexStatus.lastIndexed && (
          <SettingsRow
            icon="clock"
            title="Last Indexed"
            subtitle={new Date(indexStatus.lastIndexed).toLocaleString()}
          />
        )}
      </View>

      {/* AI Analysis */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AI PHOTO ANALYSIS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Hero status row */}
        <View style={[styles.aiHero, { borderBottomColor: colors.border }]}>
          <View style={[styles.aiIconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="cpu" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiHeroTitle, { color: colors.foreground }]}>Vision AI</Text>
            <Text style={[styles.aiHeroSub, { color: colors.mutedForeground }]}>
              {aiProgress.isAnalyzing
                ? `Analyzing ${aiProgress.analyzed} / ${aiProgress.total} photos…`
                : aiProgress.analyzed > 0
                ? `${aiProgress.analyzed} photos analyzed with AI`
                : "Not yet analyzed — tap Analyze to start"}
            </Text>
          </View>
          {aiProgress.isAnalyzing && (
            <ActivityIndicator color={colors.primary} size="small" style={{ marginLeft: 8 }} />
          )}
          {!aiProgress.isAnalyzing && aiProgress.analyzed > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.success + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>Active</Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        {aiProgress.isAnalyzing && aiProgress.total > 0 && (
          <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round((aiProgress.analyzed / aiProgress.total) * 100)}%` as any,
                },
              ]}
            />
          </View>
        )}

        {/* Error */}
        {aiProgress.error && !aiProgress.isAnalyzing && (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + "15" }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{aiProgress.error}</Text>
          </View>
        )}

        {/* Action button */}
        {aiProgress.isAnalyzing ? (
          <SettingsRow
            icon="x-circle"
            title="Cancel Analysis"
            subtitle="Stop the current AI indexing run"
            danger
            onPress={cancelAIAnalysis}
          />
        ) : (
          <SettingsRow
            icon="zap"
            title={aiProgress.analyzed > 0 ? "Analyze New Photos" : "Analyze with AI"}
            subtitle={
              aiProgress.analyzed > 0
                ? "Run AI on photos not yet analyzed"
                : "Use AI vision to precisely detect photo contents"
            }
            onPress={permission === "denied" ? undefined : analyzeAllWithAI}
          />
        )}

        {aiProgress.lastAnalyzed && (
          <SettingsRow
            icon="clock"
            title="Last AI Analysis"
            subtitle={new Date(aiProgress.lastAnalyzed).toLocaleString()}
          />
        )}
      </View>

      {/* Behavior */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BEHAVIOR</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="eye"
          title="Review Before Delete"
          subtitle="Show confirmation before deleting photos"
          right={
            <Switch
              value={reviewBeforeDelete}
              onValueChange={setReviewBeforeDelete}
              trackColor={{ false: colors.muted, true: colors.primary + "88" }}
              thumbColor={reviewBeforeDelete ? colors.primary : colors.mutedForeground}
            />
          }
        />
      </View>

      {/* Privacy */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRIVACY</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow
          icon="shield"
          title="On-Device Processing"
          subtitle="All search happens locally on your device"
          right={
            <View style={[styles.badge, { backgroundColor: colors.success + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>ON</Text>
            </View>
          }
        />
        <SettingsRow
          icon="cloud"
          title="Cloud Processing"
          subtitle="Enable for future AI-powered search (Phase 2)"
          right={
            <Switch
              value={cloudEnabled}
              onValueChange={setCloudEnabled}
              trackColor={{ false: colors.muted, true: colors.primary + "88" }}
              thumbColor={cloudEnabled ? colors.primary : colors.mutedForeground}
            />
          }
        />
        {cloudEnabled && (
          <View style={[styles.warningBox, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "44" }]}>
            <Feather name="alert-triangle" size={14} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Cloud processing is a placeholder. No data is uploaded in this version.
            </Text>
          </View>
        )}
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow icon="info" title="Version" subtitle="1.1.0 — AI Vision Search" />
        <SettingsRow icon="cpu" title="Search Engine" subtitle={`Filename tags${aiProgress.analyzed > 0 ? " + AI vision tags" : " (run AI analysis for precision)"}`} />
        <SettingsRow
          icon="lock"
          title="Privacy"
          subtitle="AI analysis sends compressed thumbnails to a private server for processing. Results are stored only on your device."
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  progressBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    margin: 12,
    marginTop: 0,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  aiHero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aiIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  aiHeroTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  aiHeroSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
