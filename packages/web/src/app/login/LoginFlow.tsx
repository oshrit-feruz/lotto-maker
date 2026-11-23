'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { safeNextPath } from '@/lib/api-client';
import { OtpForm } from '@/components/auth/OtpForm';
import { ProfileForm } from '@/components/ProfileForm';

export function LoginFlow() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const [needsProfile, setNeedsProfile] = useState(false);

  function done() {
    router.replace(next);
    router.refresh();
  }

  if (needsProfile) {
    return (
      <div className="card">
        <h1>השלמת פרטים</h1>
        <p className="muted">
          לפני ההזמנה הראשונה עלינו לוודא שאתם מעל גיל 18. הפרטים נשמרים מוצפנים ומשמשים לאימות גיל ולגביית זכיות.
        </p>
        <ProfileForm onDone={done} />
      </div>
    );
  }

  return (
    <div className="card">
      <h1>התחברות</h1>
      <OtpForm
        onVerified={(me) => {
          // First login, or a profile that was never completed: KYC step.
          if (me.verifiedAdult) done();
          else setNeedsProfile(true);
        }}
      />
    </div>
  );
}
