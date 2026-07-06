/**
 * GeoBean TV — app root. Gates on data load, then hands off to the stack
 * navigator with the Menu as the entry screen.
 *
 * @format
 */

import { NavigationContainer } from '@react-navigation/native';
import { LoadingGate } from './src/screens/LoadingGate';
import { RootNavigator } from './src/navigation';

export default function App() {
  return (
    <NavigationContainer>
      <LoadingGate>
        <RootNavigator />
      </LoadingGate>
    </NavigationContainer>
  );
}
