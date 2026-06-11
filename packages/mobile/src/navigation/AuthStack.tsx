import { useState } from 'react';
import { PhoneScreen } from '../screens/onboarding/PhoneScreen.js';
import { OTPScreen } from '../screens/onboarding/OTPScreen.js';
import { KYCScreen } from '../screens/onboarding/KYCScreen.js';
import { WalletLoadScreen } from '../screens/onboarding/WalletLoadScreen.js';
import { useAuthStore } from '../store/auth.store.js';

export function AuthStack() {
  const [phone, setPhone] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);

  // Inline navigator using state machine pattern
  const [step, setStep] = useState<'phone' | 'otp' | 'kyc' | 'wallet'>('phone');

  if (step === 'phone') {
    return <PhoneScreen onOtpSent={(p) => { setPhone(p); setStep('otp'); }} />;
  }
  if (step === 'otp') {
    return (
      <OTPScreen
        phone={phone}
        onVerified={(newUser) => {
          setIsNewUser(newUser);
          setStep(newUser ? 'kyc' : 'wallet');
        }}
      />
    );
  }
  if (step === 'kyc') {
    return <KYCScreen onVerified={() => setStep('wallet')} />;
  }
  // wallet step — after this, the auth store has isAuthenticated=true and RootNavigator switches to AppStack
  return <WalletLoadScreen onContinue={() => {
    // Setting verifiedAdult is enough; RootNavigator observes isAuthenticated
    useAuthStore.setState((s) => ({ ...s, isAuthenticated: true }));
  }} />;
}
