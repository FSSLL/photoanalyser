import { Image } from "expo-image";
import React, { useCallback } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { PhotoAsset } from "@/context/PhotoLibraryContext";
import { Feather } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLS = 3;
const GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (COLS + 1)) / COLS;

type Props = {
  photos: PhotoAsset[];
  selectedIds: Set<string>;
  onPress: (photo: PhotoAsset) => void;
  onLongPress?: (photo: PhotoAsset) => void;
  isSelectMode?: boolean;
  onEndReached?: () => void;
  ListHeaderComponent?: React.ReactElement;
  ListFooterComponent?: React.ReactElement;
  ListEmptyComponent?: React.ReactElement;
  showScore?: boolean;
  extraBottomPad?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PhotoCell({
  photo,
  isSelected,
  isSelectMode,
  onPress,
  onLongPress,
  showScore,
}: {
  photo: PhotoAsset;
  isSelected: boolean;
  isSelectMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  showScore?: boolean;
}) {
  const colors = useColors();
  return (
    <AnimatedPressable
      entering={FadeIn.duration(200)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.cell, { width: CELL_SIZE, height: CELL_SIZE }]}
    >
      <Image
        source={{ uri: photo.uri }}
        style={styles.image}
        contentFit="cover"
        recyclingKey={photo.id}
        transition={150}
      />
      {photo.mediaType === "video" && (
        <View style={styles.videoBadge}>
          <Feather name="play" size={10} color="#fff" />
        </View>
      )}
      {isSelectMode && (
        <View
          style={[
            styles.selectionRing,
            isSelected && { backgroundColor: colors.primary + "33", borderColor: colors.primary },
          ]}
        >
          {isSelected && (
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={12} color="#fff" />
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

export default function PhotoGrid({
  photos,
  selectedIds,
  onPress,
  onLongPress,
  isSelectMode,
  onEndReached,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  showScore,
  extraBottomPad = 0,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: PhotoAsset }) => (
      <PhotoCell
        photo={item}
        isSelected={selectedIds.has(item.id)}
        isSelectMode={isSelectMode}
        onPress={() => onPress(item)}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        showScore={showScore}
      />
    ),
    [selectedIds, isSelectMode, onPress, onLongPress, showScore]
  );

  const keyExtractor = useCallback((item: PhotoAsset) => item.id, []);

  const defaultPadBottom = Platform.OS === "web" ? 34 : 120;

  return (
    <FlatList
      data={photos}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLS}
      contentContainerStyle={[styles.container, { paddingBottom: defaultPadBottom + extraBottomPad }]}
      columnWrapperStyle={styles.row}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS !== "web"}
      maxToRenderPerBatch={30}
      windowSize={10}
      initialNumToRender={30}
    />
  );
}

const styles = StyleSheet.create({
  container: {},
  row: {
    gap: GAP,
    marginBottom: GAP,
    paddingHorizontal: GAP,
  },
  cell: {
    overflow: "hidden",
    backgroundColor: "#1a2332",
    borderRadius: 2,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  selectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 2,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 5,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
});
