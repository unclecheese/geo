import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MenuScreen } from "./screens/MenuScreen";
import { ConfigScreen } from "./screens/ConfigScreen";
import { MapQuizScreen } from "./screens/MapQuizScreen";
import { ExpertQuizScreen } from "./screens/ExpertQuizScreen";
import { BordersQuizScreen } from "./screens/BordersQuizScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { MapProbeScreen } from "./screens/MapProbeScreen";

/**
 * Menu is the intro card screen (the web landing); Config is the per-family
 * settings drill-down (Map or Quiz), pushed from a card. The quiz/results/stats
 * screens are reached from Config/Menu. Each family screen pulls its live
 * session out of the relevant core store on mount, the same contract the web
 * pages use — the Config screen just normalises the settings before navigating.
 */
export type RootStackParamList = {
  Menu: undefined;
  // The web landing's two active families. "map" hosts find/name; "expert" hosts
  // capital/flag (combinable) + borders (exclusive). Puzzle/build is not offered.
  Config: { family: "map" | "expert" };
  MapQuiz: undefined;
  ExpertQuiz: undefined;
  BordersQuiz: undefined;
  Results: undefined;
  Stats: undefined;
  // Task 9: temporary Skia-map probe. A later task folds the map into the real
  // find/name flow and this route can go.
  MapProbe: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Menu" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Menu" component={MenuScreen} />
      <Stack.Screen name="Config" component={ConfigScreen} />
      <Stack.Screen name="MapQuiz" component={MapQuizScreen} />
      <Stack.Screen name="ExpertQuiz" component={ExpertQuizScreen} />
      <Stack.Screen name="BordersQuiz" component={BordersQuizScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
      <Stack.Screen name="MapProbe" component={MapProbeScreen} />
    </Stack.Navigator>
  );
}
