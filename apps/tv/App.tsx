/**
 * GeoBean TV — Task 7 smoke test.
 * Renders a value computed by @geobean/core to prove Metro resolves the shared
 * package (and its zustand / d3-geo transitive deps) on-device.
 *
 * @format
 */

import { Text, View } from 'react-native';
import { Logic, STATE_VERSION } from '@geobean/core';

export default function App() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0b1d33',
      }}>
      <Text style={{ color: '#f4e9d3', fontSize: 40, textAlign: 'center' }}>
        GeoBean core v{STATE_VERSION} — levenshtein("colour","color") ={' '}
        {Logic.levenshtein('colour', 'color')}
      </Text>
    </View>
  );
}
