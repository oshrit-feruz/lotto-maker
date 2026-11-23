import type { Metadata } from 'next';
import { DrawStrip } from '@/components/ticket/DrawStrip';
import { TicketForm } from '@/components/ticket/TicketForm';
import { publicFetch } from '@/lib/server-api';
import type { NextDraw } from '@/lib/types';

export const metadata: Metadata = { title: 'מילוי טופס לוטו' };

// Rendered per request (never baked at build time); the backend data itself is cached by fetch.
export const dynamic = 'force-dynamic';

export default async function TicketPage() {
  const next = await publicFetch<NextDraw>('/draws/next');
  return (
    <>
      <h1>מילוי טופס לוטו</h1>
      <DrawStrip draw={next.ok ? next.data : null} />
      <TicketForm />
    </>
  );
}
