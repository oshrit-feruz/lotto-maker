// pais.co.il relay. Runs in an Israeli region (Google Cloud Run, me-west1 / Tel Aviv) because
// pais.co.il gives no response to requests from outside Israel, and Vercel has no Israeli region.
//
// The backend points PAIS_BASE_URL at https://<service-url>/<RELAY_TOKEN>; this server checks the
// token, forwards only the read-only paths the backend uses, and returns Pais's response as is.
// No dependencies: Node 20+ (global fetch).
import { createServer } from 'node:http';

const TOKEN = process.env.RELAY_TOKEN ?? '';
const UPSTREAM = 'https://www.pais.co.il';
// Each route maps a request to an upstream URL built only from constants and validated digits,
// so nothing from the request is passed through as-is.
const ROUTES = [
  { re: /^\/include\/getNextLotteryDate\.ashx\?type=1$/, build: () => '/include/getNextLotteryDate.ashx?type=1' },
  { re: /^\/Lotto\/CurrentLotto\.aspx\?lotteryId=(\d{1,7})$/, build: (m) => `/Lotto/CurrentLotto.aspx?lotteryId=${Number(m[1])}` },
  // ResultsScraper archive fallback: /<lotto|chance|777|123>/showMoreResults.aspx?fromIndex=N&amount=N
  {
    re: /^\/(lotto|chance|777|123)\/showMoreResults\.aspx\?fromIndex=(\d{1,4})&amount=(\d{1,3})$/,
    build: (m) => `/${GAMES[m[1]]}/showMoreResults.aspx?fromIndex=${Number(m[2])}&amount=${Number(m[3])}`,
  },
];
const GAMES = { lotto: 'lotto', chance: 'chance', 777: '777', 123: '123' };
const USER_AGENT = 'LottoMakerResultsSync/1.0 (via pais-relay)';
const TIMEOUT_MS = 15_000;

if (TOKEN.length < 32) {
  console.error('RELAY_TOKEN must be set (32+ characters)');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, 'method not allowed');
  if (req.url === '/healthz') return send(res, 200, 'ok');

  const prefix = `/${TOKEN}`;
  if (!req.url?.startsWith(`${prefix}/`)) return send(res, 404, 'not found');
  const requested = req.url.slice(prefix.length);
  let path;
  for (const route of ROUTES) {
    const m = route.re.exec(requested);
    if (m) {
      path = route.build(m);
      break;
    }
  }
  if (!path) return send(res, 404, 'not found');

  try {
    const upstream = await fetch(UPSTREAM + path, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
    res.end(body);
    console.log(JSON.stringify({ path: path.split('?')[0], status: upstream.status, bytes: body.length }));
  } catch (err) {
    console.error(JSON.stringify({ path: path.split('?')[0], error: String(err?.message ?? err) }));
    send(res, 502, 'upstream unreachable');
  }
});

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(text);
}

server.listen(Number(process.env.PORT ?? 8080), () => console.log('pais-relay listening'));
