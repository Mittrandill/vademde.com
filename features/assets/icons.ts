import type { Ionicons } from "@expo/vector-icons";
export function assetIcon(kind: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case "vehicle":
      return "car";
    case "home":
      return "home";
    case "commercial":
      return "business";
    case "field":
      return "leaf";
    case "land":
      return "map";
    default:
      return "cube";
  }
}
