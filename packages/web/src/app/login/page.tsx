import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginFlow } from './LoginFlow';

export const metadata: Metadata = { title: 'התחברות' };

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      <Suspense>
        <LoginFlow />
      </Suspense>
    </div>
  );
}
