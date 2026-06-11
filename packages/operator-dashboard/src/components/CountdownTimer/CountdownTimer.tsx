import { useCountdown } from '../../hooks/useCountdown.js';

interface Props {
  deadline: string;
}

export function CountdownTimer({ deadline }: Props) {
  const { minutes, seconds, isUrgent } = useCountdown(deadline);
  const color = isUrgent ? '#e02424' : '#1a56db';
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <span style={{ color, fontWeight: 700, fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>
      {pad(minutes)}:{pad(seconds)}
    </span>
  );
}
