/**
 * GeoBean TV — app root. Gates on data load, then hands off to the stack
 * navigator with the Menu as the entry screen.
 *
 * @format
 */

import { NavigationContainer } from '@react-navigation/native';
import { LoadingGate } from './src/screens/LoadingGate';
import { RootNavigator } from './src/navigation';
import { TvToast } from './src/components/TvToast';

export default function App() {
  return (
    <NavigationContainer>
      <LoadingGate>
        <RootNavigator />
        {/* One global toast renderer above the navigator — the quiz stores fire
            praise / "Not quite" / pool-warning toasts through the shared store. */}
        <TvToast />
      </LoadingGate>
    </NavigationContainer>
  );
}
