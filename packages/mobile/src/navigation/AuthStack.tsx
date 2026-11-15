import { useState } from 'react';
import { PhoneScreen } from '../screens/onboarding/PhoneScreen.js';
import { OTPScreen } from '../screens/onboarding/OTPScreen.js';
import { KYCScreen } from '../screens/onboarding/KYCScreen.js';
import { WalletLoadScreen } from '../screens/onboarding/WalletLoadScreen.js';
import { useAuthStore } from '../store/auth.store.js';
import { postOtpStep } from '../lib/onboarding.js';

/**
 * Onboarding as a small state machine: phone → OTP → KYC → wallet load.
 * A verified user goes from the OTP straight to the app; anyone else goes
 * through KYC and then the (skippable) wallet load. Only signIn() switches
 * RootNavigator to the app.
 */
export function AuthStack() {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'kyc' | 'wallet'>('phone');
  const signIn = useAuthStore((s) => s.signIn);

  if (step === 'phone') {
    return <PhoneScreen onOtpSent={(p) => { setPhone(p); setStep('otp'); }} />;
  }
  if (step === 'otp') {
    return (
      <OTPScreen
        phone={phone}
        onVerified={(user) => {
          if (postOtpStep(user) === 'home') signIn();
          else setStep('kyc');
        }}
      />
    );
  }
  if (step === 'kyc') {
    return <KYCScreen onVerified={() => setStep('wallet')} />;
  }
  return <WalletLoadScreen onContinue={signIn} />;
}
