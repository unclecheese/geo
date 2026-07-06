import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MenuScreen } from "./screens/MenuScreen";
import { MapQuizScreen } from "./screens/MapQuizScreen";
import { ExpertQuizScreen } from "./screens/ExpertQuizScreen";
import { BordersQuizScreen } from "./screens/BordersQuizScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { MapProbeScreen } from "./screens/MapProbeScreen";

/**
 * The six screens. Menu is the session-setup hub; the four quiz/results/stats
 * screens are reached from it. Params are empty for now — each family screen
 * pulls its live session out of the relevant core store on mount, the same
 * contract the web pages use.
 */
export type RootStackParamList = {
  Menu: undefined;
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
      <Stack.Screen name="MapQuiz" component={MapQuizScreen} />
      <Stack.Screen name="ExpertQuiz" component={ExpertQuizScreen} />
      <Stack.Screen name="BordersQuiz" component={BordersQuizScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="Stats" component={StatsScreen} />
      <Stack.Screen name="MapProbe" component={MapProbeScreen} />
    </Stack.Navigator>
  );
}
