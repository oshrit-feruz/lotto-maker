import { Link } from 'react-router-dom';
import type { Requester } from '../api/types';
import { formatPhoneLocal } from '../lib/phone';

/** The user's name and phone, linking to their page. */
export default function RequesterLink({ userId, user }: { userId: string; user: Requester | null | undefined }) {
  return (
    <Link to={`/users/${userId}`}>
      {user?.fullName ?? '—'}
      <br />
      <span className="ltr muted">{user?.phone ? formatPhoneLocal(user.phone) : userId.slice(-8)}</span>
    </Link>
  );
}
