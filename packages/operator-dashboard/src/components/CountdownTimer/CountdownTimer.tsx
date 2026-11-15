import { useCountdown } from '../../hooks/useCountdown.js';
import { pad2 } from '../../lib/display.js';

interface Props {
  deadline: string;
}

export function CountdownTimer({ deadline }: Props) {
  const { minutes, seconds, isUrgent } = useCountdown(deadline);

  return (
    <span className={isUrgent ? 'countdown urgent' : 'countdown'} title="זמן עד המועד האחרון">
      {pad2(minutes)}:{pad2(seconds)}
    </span>
  );
}
