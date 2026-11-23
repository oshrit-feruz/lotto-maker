import { requireSession, type SearchParams } from '@/lib/require-session';
import { SavedCards } from '@/components/account/SavedCards';

export default function CardsPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/account/cards', searchParams);
  return <SavedCards />;
}
