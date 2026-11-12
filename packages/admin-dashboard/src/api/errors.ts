/**
 * Hebrew messages for the backend's error codes (`{ error: CODE, message }`). The backend's own
 * `message` is English, so an `ApiError` carries the Hebrew text below when the code is known.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'הנתונים שנשלחו אינם תקינים',
  INTERNAL_ERROR: 'שגיאת שרת – נסה שוב',
  INVALID_DATE: 'תאריך לא תקין',

  // Users
  INVALID_PHONE_QUERY: 'יש להזין לפחות 3 ספרות של מספר טלפון ישראלי, למשל 050-123',
  USER_NOT_FOUND: 'המשתמש לא נמצא',

  // Prize claims
  CLAIM_NOT_FOUND: 'הזכייה לא נמצאה',
  CLAIM_ALREADY_COLLECTED: 'הזכייה כבר נמסרה',
  CLAIM_EXPIRED: 'תוקף הזכייה פג – לא ניתן למסור או לתאם',
  CLAIM_NOT_OPEN: 'הזכייה אינה פתוחה עוד למסירה או לתיאום',
  ID_NOT_ON_FILE: 'אין לזוכה תעודת זהות מאומתת במערכת – לא ניתן למסור את הזכייה',
  ID_MISMATCH: 'הספרות אינן תואמות לתעודת הזהות של הזוכה – הזכייה לא נמסרה',
  INVALID_SLOT: 'המועד חייב להיות בעתיד ולפני תום תוקף הזכייה',

  // Draws
  DRAW_NOT_FOUND: 'ההגרלה לא נמצאה',
  DRAW_NOT_EDITABLE: 'לא ניתן לערוך את התוצאות לאחר שאושרו',
  DRAW_NOT_CONFIRMABLE: 'לא ניתן לאשר את ההגרלה במצבה הנוכחי',
  RESULTS_CHANGED: 'התוצאות השתנו מאז שנבדקו. הנתונים נטענו מחדש – בדוק אותם שוב לפני האישור.',
  RESULTS_INCOMPLETE: 'חסרים מספרים, מספר חזק או טבלאות הפרסים של לוטו ודאבל לוטו',
  INVALID_RESULTS: 'התוצאות אינן תקינות',

  // Withdrawals
  WITHDRAWAL_NOT_FOUND: 'המשיכה לא נמצאה',
  WITHDRAWAL_NOT_APPROVABLE: 'לא ניתן לאשר את המשיכה במצבה הנוכחי',
  WITHDRAWAL_NOT_REJECTABLE: 'לא ניתן לדחות את המשיכה במצבה הנוכחי',
  WITHDRAWAL_NOT_BANK: 'הפעולה אפשרית רק במשיכה לחשבון בנק',
  WITHDRAWAL_NOT_PAYABLE: 'ניתן לסמן כשולמה רק משיכה שאושרה',

  // Card credits
  CARD_CREDIT_NOT_FOUND: 'הזיכוי לא נמצא',
  CARD_CREDIT_NOT_PENDING: 'הזיכוי אינו ממתין לתשלום',
};

/** The Hebrew message for a backend error code, or undefined when the code is unknown. */
export function messageForCode(code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined;
}

/** The text to show for any thrown value. */
export function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'שגיאה לא צפויה';
}
