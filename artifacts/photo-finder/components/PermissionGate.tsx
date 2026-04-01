import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type Props = {
  onRequest: () => void;
  isLimited?: boolean;
};

export default function PermissionGate({ onRequest, isLimited }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (isLimited) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name="image" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Limited Access</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          You've granted limited photo access. Photo Finder can only search the photos you've selected. You can expand access in Settings.
        </Text>
        <Pressable
          onPress={onRequest}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Expand Access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
        <Feather name="camera" size={36} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Photo Library Access</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Photo Finder AI needs access to your photo library to search, browse, and manage your photos — all on-device. Your photos are never uploaded anywhere.
      </Text>
      <View style={styles.bullets}>
        {[
          ["shield", "All processing stays on your device"],
          ["search", "Find photos with natural language"],
          ["trash-2", "Safely delete with confirmation"],
        ].map(([icon, text]) => (
          <View key={icon} style={styles.bullet}>
            <Feather name={icon as any} size={16} color={colors.primary} />
            <Text style={[styles.bulletText, { color: colors.mutedForeground }]}>{text}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onRequest}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Allow Photo Access</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  bullets: {
    width: "100%",
    gap: 12,
    marginVertical: 8,
  },
  bullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulletText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
