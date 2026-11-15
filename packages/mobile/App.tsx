import { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { applyDocumentDirection, colors, fontAssets } from './src/theme';

applyDocumentDirection();

function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    // Without the bundled faces the app still works, in the system font.
    if (fontError) console.warn('Fonts failed to load; using the system font.', fontError);
  }, [fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.pine }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.pine} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
export default App;
