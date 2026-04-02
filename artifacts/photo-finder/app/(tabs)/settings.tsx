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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhotoLibrary } from "@/context/PhotoLibraryContext";
import { isMlKitAvailable } from "@/services/offlineAIService";
import { getEmbeddedApiKey } from "@/services/geminiVisionService";
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
    reviewBeforeDelete,
    setReviewBeforeDelete,
    photos,
    aiProgress,
    analyzeAllWithAI,
    cancelAIAnalysis,
    modelVersion,
    checkForModelUpdate,
    geminiEnabled,
    setGeminiEnabled,
  } = usePhotoLibrary();

  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const [lastUpdateMsg, setLastUpdateMsg] = React.useState<string | null>(null);
  const mlkitAvailable = React.useMemo(() => isMlKitAvailable(), []);
  const hasEmbeddedKey = React.useMemo(() => getEmbeddedApiKey().trim().length > 0, []);

  const handleToggleGemini = async (v: boolean) => {
    await setGeminiEnabled(v);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setLastUpdateMsg(null);
    try {
      const result = await checkForModelUpdate();
      setLastUpdateMsg(result.updated ? `Updated to v${result.version}` : "Already on the latest model");
    } catch {
      setLastUpdateMsg("Could not reach update server");
    } finally {
      setCheckingUpdate(false);
    }
  };

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
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OFFLINE AI ANALYSIS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Hero status row */}
        <View style={[styles.aiHero, { borderBottomColor: colors.border }]}>
          <View style={[styles.aiIconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="cpu" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiHeroTitle, { color: colors.foreground }]}>On-Device AI</Text>
            <Text style={[styles.aiHeroSub, { color: colors.mutedForeground }]}>
              {aiProgress.isAnalyzing
                ? `Analyzing ${aiProgress.analyzed} / ${aiProgress.total} photos…`
                : aiProgress.analyzed > 0
                ? `${aiProgress.analyzed} photos analyzed (on-device)`
                : "Tap below to analyze your library on-device"}
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

        {/* Model version + update */}
        <SettingsRow
          icon="package"
          title="Classifier Model"
          subtitle={`v${modelVersion} · all processing on-device`}
          right={
            checkingUpdate ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity
                onPress={handleCheckUpdate}
                style={[styles.updateBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "15" }]}
              >
                <Text style={[styles.updateBtnText, { color: colors.primary }]}>Check for update</Text>
              </TouchableOpacity>
            )
          }
        />

        {lastUpdateMsg && (
          <View style={[styles.warningBox, { backgroundColor: colors.success + "15", borderColor: colors.success + "44" }]}>
            <Feather name="check-circle" size={14} color={colors.success} />
            <Text style={[styles.warningText, { color: colors.success }]}>{lastUpdateMsg}</Text>
          </View>
        )}

        {/* Visual AI (ML Kit) status */}
        <SettingsRow
          icon={mlkitAvailable ? "eye" : "eye-off"}
          title="Visual AI (ML Kit)"
          subtitle={
            mlkitAvailable
              ? "On — recognises food, animals, nature, people & more"
              : "Requires app build — not available in Expo Go"
          }
          right={
            <View
              style={[
                styles.badge,
                { backgroundColor: mlkitAvailable ? colors.success + "22" : colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: mlkitAvailable ? colors.success : colors.mutedForeground },
                ]}
              >
                {mlkitAvailable ? "Active" : "Off"}
              </Text>
            </View>
          }
        />

        {/* OCR status */}
        <SettingsRow
          icon={mlkitAvailable ? "type" : "type"}
          title="Text Recognition (OCR)"
          subtitle={
            mlkitAvailable
              ? "On — reads text in receipts, documents, whiteboards"
              : "Requires app build — reads text inside any photo"
          }
          right={
            <View
              style={[
                styles.badge,
                { backgroundColor: mlkitAvailable ? colors.success + "22" : colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: mlkitAvailable ? colors.success : colors.mutedForeground },
                ]}
              >
                {mlkitAvailable ? "Active" : "Off"}
              </Text>
            </View>
          }
        />

        {!mlkitAvailable && (
          <View style={[styles.warningBox, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.warningText, { color: colors.primary }]}>
              Build the app with EAS or install from the App Store to enable full visual AI analysis.
            </Text>
          </View>
        )}

        {aiProgress.isAnalyzing ? (
          <SettingsRow
            icon="x-circle"
            title="Cancel Analysis"
            subtitle="Stop the current on-device indexing run"
            danger
            onPress={cancelAIAnalysis}
          />
        ) : (
          <SettingsRow
            icon="zap"
            title={aiProgress.analyzed > 0 ? "Analyze New Photos" : "Analyze Library (On-Device)"}
            subtitle={
              aiProgress.analyzed > 0
                ? mlkitAvailable
                  ? "Re-analyze using visual AI + EXIF + filenames"
                  : "Run the on-device AI on photos not yet analyzed"
                : mlkitAvailable
                ? "Visual AI labels every photo: food, animals, nature & more"
                : "EXIF, dimensions & filenames — photos stay on device"
            }
            onPress={permission === "denied" ? undefined : analyzeAllWithAI}
          />
        )}

        {aiProgress.lastAnalyzed && (
          <SettingsRow
            icon="clock"
            title="Last Analysis"
            subtitle={new Date(aiProgress.lastAnalyzed).toLocaleString()}
          />
        )}
      </View>

      {/* Deep AI Analysis */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DEEP AI ANALYSIS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Toggle row */}
        <View style={[styles.aiHero, { borderBottomColor: colors.border }]}>
          <View style={[styles.aiIconWrap, { backgroundColor: geminiEnabled ? "#7C3AED18" : colors.muted }]}>
            <Feather name="zap" size={22} color={geminiEnabled ? "#7C3AED" : colors.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiHeroTitle, { color: colors.foreground }]}>Gemini Vision AI</Text>
            <Text style={[styles.aiHeroSub, { color: colors.mutedForeground }]}>
              {geminiEnabled
                ? "ON — every photo deeply analyzed for people, animals, food, events & more"
                : "OFF — enable for deep AI understanding of every photo"}
            </Text>
          </View>
          <Switch
            value={geminiEnabled}
            onValueChange={handleToggleGemini}
            trackColor={{ false: colors.muted, true: "#7C3AED88" }}
            thumbColor={geminiEnabled ? "#7C3AED" : colors.mutedForeground}
          />
        </View>

        {/* Key status badge */}
        <View style={[styles.warningBox, {
          backgroundColor: hasEmbeddedKey ? "#7C3AED12" : colors.muted + "33",
          borderColor: hasEmbeddedKey ? "#7C3AED33" : colors.border,
        }]}>
          <Feather
            name={hasEmbeddedKey ? "lock" : "alert-circle"}
            size={14}
            color={hasEmbeddedKey ? "#7C3AED" : colors.mutedForeground}
          />
          <Text style={[styles.warningText, { color: hasEmbeddedKey ? "#7C3AED" : colors.mutedForeground }]}>
            {hasEmbeddedKey
              ? "API key embedded in this build — photos are analyzed securely, no setup needed"
              : "No API key configured in this build. Contact the developer to enable Deep AI."}
          </Text>
        </View>

        {/* Info */}
        <View style={[styles.warningBox, { backgroundColor: colors.muted + "22", borderColor: colors.border, marginTop: 0 }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
            Gemini Vision reads each photo and creates detailed tags like "girl smiling at birthday party with cake" so any natural language search finds the right photos instantly.
          </Text>
        </View>

        {geminiEnabled && hasEmbeddedKey && (
          <SettingsRow
            icon="refresh-cw"
            title="Re-analyze with Deep AI"
            subtitle="Run Gemini Vision on all photos to generate the richest possible tags"
            onPress={permission === "denied" ? undefined : analyzeAllWithAI}
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
          title="Photos Stay On Device"
          subtitle="Your photos are never sent to any server — analysis is 100% on-device"
          right={
            <View style={[styles.badge, { backgroundColor: colors.success + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>Guaranteed</Text>
            </View>
          }
        />
        <SettingsRow
          icon="download"
          title="Model Updates"
          subtitle="Only a small rules file is downloaded — no photos are uploaded"
          right={
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>Safe</Text>
            </View>
          }
        />
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SettingsRow icon="info" title="Version" subtitle="1.2.0 — Offline AI Search" />
        <SettingsRow
          icon="cpu"
          title="Search Engine"
          subtitle={`On-device classifier${aiProgress.analyzed > 0 ? " + EXIF analysis active" : " (tap Analyze Library to index)"}`}
        />
        <SettingsRow
          icon="lock"
          title="Privacy"
          subtitle="Photos never leave your device. The AI model self-updates by downloading only a small rules config."
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
  updateBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  updateBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  apiKeyInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
