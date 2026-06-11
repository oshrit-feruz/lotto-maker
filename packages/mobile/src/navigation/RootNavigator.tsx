import { useAuthStore } from '../store/auth.store.js';
import { AuthStack } from './AuthStack.js';
import { AppStack } from './AppStack.js';

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <AppStack /> : <AuthStack />;
}
