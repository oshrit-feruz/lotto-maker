import { create } from 'zustand';

interface User {
  id: string;
  phone: string;
  fullName: string | null;
  verifiedAdult: boolean;
  walletBalance: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  /** Stores the profile only: the user stays in onboarding until signIn(). */
  setUser: (user: User) => void;
  /** Ends onboarding: RootNavigator switches to the app. */
  signIn: () => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user }),
  signIn: () => set({ isAuthenticated: true }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
