/**
 * Whether a response means the operator's session is over (clear the token and reload to the login
 * page). Only a 401 to a request that carried a token counts: the login calls under /auth/ answer
 * 401 for a wrong code, and the login page shows that inline instead.
 */
export function endsSession(request: Request, response: Response): boolean {
  if (response.status !== 401) return false;
  if (!request.headers.has('Authorization')) return false;
  return !/(^|\/)auth\//.test(new URL(request.url).pathname);
}
