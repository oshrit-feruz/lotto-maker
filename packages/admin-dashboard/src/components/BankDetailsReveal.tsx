import { useMutation } from '@tanstack/react-query';
import { errorText } from '../api/errors';
import { getWithdrawalBankDetails } from '../api/payouts';

/**
 * The decrypted bank account of a withdrawal, fetched only when the admin clicks the button.
 * Every fetch is written to the audit log, so nothing fetches it automatically and the result is
 * kept only in this component's state (gone when the dialog closes), never in the query cache.
 */
export default function BankDetailsReveal({ withdrawalId }: { withdrawalId: string }) {
  const reveal = useMutation({ mutationFn: () => getWithdrawalBankDetails(withdrawalId) });

  if (reveal.data) {
    const b = reveal.data.bank;
    return (
      <div className="card" data-testid="bank-details">
        <p>
          בעל החשבון: <strong>{b.holderName}</strong>
        </p>
        <p>
          בנק: <span className="ltr">{b.bankCode}</span> · סניף: <span className="ltr">{b.branchCode}</span> · חשבון:{' '}
          <span className="ltr">{b.accountNumber}</span>
        </p>
        <p className="muted">הצפייה נרשמה ביומן הביקורת.</p>
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="secondary" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
        {reveal.isPending ? 'טוען…' : 'הצג פרטי בנק'}
      </button>{' '}
      <span className="muted">הצפייה נרשמת ביומן הביקורת.</span>
      {reveal.isError && (
        <p className="error" role="alert">
          {errorText(reveal.error)}
        </p>
      )}
    </div>
  );
}
