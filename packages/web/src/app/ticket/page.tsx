import type { Metadata } from 'next';
import { TicketForm } from '@/components/ticket/TicketForm';

export const metadata: Metadata = { title: 'מילוי טופס לוטו' };

export default function TicketPage() {
  return (
    <>
      <h1>מילוי טופס לוטו</h1>
      <TicketForm />
    </>
  );
}
