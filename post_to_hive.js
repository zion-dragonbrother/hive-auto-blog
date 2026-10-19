const dhive = require('@hiveio/dhive');

const HIVE_NODES = [
  'https://api.hive.blog',
  'https://api.openhive.network',
  'https://rpc.mahdiyari.info',
  'https://api.deathwing.me'
];

const ADDRESS_PREFIX = 'STM';
const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d';
const COINGECKO_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';
const COINPAPRIKA_TICKERS_URL = 'https://api.coinpaprika.com/v1/tickers?quotes=USD';
const COINPAPRIKA_GLOBAL_URL = 'https://api.coinpaprika.com/v1/global';

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function createClient() {
  return new dhive.Client(HIVE_NODES);
}

function normalizeHiveUser(raw) {
  return String(raw || '').replace(/@/g, '').trim().toLowerCase();
}

function isValidHiveAccountName(name) {
  if (typeof name !== 'string' || name.length < 3 || name.length > 16) return false;
  return name.split('.').every((segment) => segment.length >= 3 && /^[a-z][a-z0-9-]*$/.test(segment));
}

function isDryRun(env = process.env, argv = process.argv) {
  if (argv.includes('--dry-run')) return true;
  const value = String(env.DRY_RUN ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function redactSecrets(text, secrets) {
  let out = String(text);
  for (const secret of secrets || []) {
    const value = String(secret || '').trim();
    if (value.length < 8) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

function secretValues(env) {
  return [env && env.HIVE_POSTING_KEY, env && env.COINGECKO_API_KEY];
}

function missingUserMessage() {
  return [
    'HIVE_USER is not set.',
    "Set the GitHub secret to the Hive account name without '@'.",
    'HIVE_USER가 설정되지 않았습니다.',
    "GitHub secret에는 '@' 없이 Hive 계정 이름을 넣으세요."
  ].join('\n');
}

function invalidUserMessage() {
  return [
    'HIVE_USER is not a valid Hive account name.',
    "Use 3–16 characters: lowercase letters, digits, hyphens, or dots. Each dot-separated part must be at least 3 characters. Do not include '@'.",
    'HIVE_USER가 올바른 Hive 계정 이름이 아닙니다.',
    "'@' 없이 3–16자의 소문자, 숫자, 하이픈, 마침표만 사용할 수 있습니다. 마침표로 나뉜 각 부분은 3자 이상이어야 합니다."
  ].join('\n');
}

function missingKeyMessage() {
  return [
    'HIVE_POSTING_KEY is not set.',
    'Set the GitHub secret to the private posting key. That key is a WIF string starting with 5.',
    'Do not paste the public key (it starts with STM) or the owner, active, or memo key.',
    'HIVE_POSTING_KEY가 설정되지 않았습니다.',
    'STM으로 시작하는 공개키가 아니라, 5로 시작하는 포스팅 개인키(WIF)를 넣으세요.',
    'owner, active, memo 키는 사용할 수 없습니다.'
  ].join('\n');
}

function invalidKeyMessage() {
  return [
    'HIVE_POSTING_KEY is not a valid WIF private key.',
    'The private posting key starts with 5. A public key starts with STM and cannot sign a post.',
    'HIVE_POSTING_KEY가 올바른 WIF 개인키가 아닙니다.',
    '포스팅 개인키는 5로 시작합니다. STM으로 시작하는 공개키로는 글을 올릴 수 없습니다.'
  ].join('\n');
}

function accountNotFoundMessage(username) {
  return [
    `Hive account "${username}" was not found.`,
    "HIVE_USER must be the account name with no '@'.",
    'The chain error "unknown key ... account_authority_object ... by_account" means this username is not an account, so the post was not broadcast.',
    `Hive 계정 "${username}"을(를) 찾을 수 없습니다.`,
    "HIVE_USER는 '@' 없는 계정 이름이어야 합니다.",
    '"unknown key ... by_account" 오류는 체인에서 이 계정을 찾지 못했다는 뜻입니다. 글은 올리지 않았습니다.'
  ].join('\n');
}

function accountFetchFailedMessage(username, err, secrets) {
  const reason = redactSecrets(err && err.message ? err.message : 'unknown error', secrets).split('\n')[0].slice(0, 300);
  return [
    `Could not load Hive account "${username}" to verify the posting key (${reason}).`,
    'The post was not broadcast.',
    `포스팅 키를 확인하려고 Hive 계정 "${username}"을(를) 불러오지 못했습니다 (${reason}).`,
    '글은 올리지 않았습니다.'
  ].join('\n');
}

function formatPublicKey(publicKey) {
  return typeof publicKey === 'string' && publicKey.startsWith(ADDRESS_PREFIX) ? publicKey : '(unavailable)';
}

function authorityKey(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.toString === 'function') return value.toString();
  return '';
}

function postingKeyMismatchMessage(username, publicKey) {
  return [
    `The posting key does not match @${username}.`,
    "The public key derived from HIVE_POSTING_KEY is not in that account's posting.key_auths.",
    `Derived public key: ${formatPublicKey(publicKey)}`,
    'Use the private posting key (WIF starting with 5) for this account. Owner, active, and memo keys are rejected. The private key was not printed.',
    `@${username} 계정의 포스팅 키가 아닙니다.`,
    'HIVE_POSTING_KEY에서 만든 공개키가 해당 계정의 posting.key_auths에 없습니다.',
    '5로 시작하는 포스팅 개인키를 사용하세요. owner, active, memo 키는 거부됩니다. 개인키는 출력하지 않았습니다.'
  ].join('\n');
}

function postingKeyWeightMessage(username, weight, threshold) {
  return [
    `The posting key for @${username} is listed, but its weight (${weight}) is below the posting threshold (${threshold}), so it cannot authorize a post by itself.`,
    `@${username} 계정의 포스팅 키가 등록되어 있지만 가중치(${weight})가 임계값(${threshold})보다 낮아 이 키만으로는 글을 올릴 수 없습니다.`
  ].join('\n');
}

function checkPostingKey(account, publicKey) {
  const username = account && account.name ? account.name : '(unknown account)';
  const posting = (account && account.posting) || {};
  const keyAuths = Array.isArray(posting.key_auths) ? posting.key_auths : [];
  const match = keyAuths.find((entry) => Array.isArray(entry) && authorityKey(entry[0]) === publicKey);
  if (!match) return postingKeyMismatchMessage(username, publicKey);
  const weight = Number(match[1]);
  const threshold = Number(posting.weight_threshold ?? 1);
  if (!Number.isFinite(weight) || weight <= 0 || (Number.isFinite(threshold) && weight < threshold)) {
    return postingKeyWeightMessage(username, weight, threshold);
  }
  return null;
}

function parsePostingKey(raw) {
  const key = String(raw || '').trim();
  if (!key) throw new ConfigError(missingKeyMessage());
  try {
    return dhive.PrivateKey.fromString(key);
  } catch {
    throw new ConfigError(invalidKeyMessage());
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt, response, random = Math.random) {
  const header = response && response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('retry-after')
    : null;
  if (header != null && /^[1-9]\d*$/.test(String(header).trim())) {
    return Math.min(Number(header) * 1000, 20000);
  }
  const backoff = 1000 * (2 ** attempt);
  const jitter = Math.floor(random() * 250);
  return Math.min(backoff + jitter, 20000);
}

async function getJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleep = options.sleep || delay;
  const random = options.random || Math.random;
  const maxAttempts = options.maxAttempts || 4;
  const headers = Object.assign({
    accept: 'application/json',
    'user-agent': 'hive-auto-blog/1.0'
  }, options.headers || {});

  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs(attempt, null, random));
        continue;
      }
      throw lastError;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new Error('HTTP ' + response.status + ' from ' + url);
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs(attempt, response, random));
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' from ' + url);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('Invalid JSON from ' + url);
    }
  }

  throw lastError || new Error('Request failed for ' + url);
}

function coingeckoHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return {};
  return { 'x-cg-demo-api-key': key };
}

function normalizeCoinPaprika(tickers, global) {
  if (!Array.isArray(tickers) || !global || typeof global !== 'object') {
    throw new Error('CoinPaprika returned an unexpected payload');
  }
  const mapped = tickers.map((ticker) => {
    const quote = (ticker && ticker.quotes && ticker.quotes.USD) || {};
    return {
      id: ticker && ticker.id,
      symbol: String((ticker && ticker.symbol) || '').toLowerCase(),
      name: ticker && ticker.name,
      current_price: quote.price,
      price_change_percentage_24h: quote.percent_change_24h,
      price_change_percentage_7d_in_currency: quote.percent_change_7d,
      total_volume: quote.volume_24h,
      market_cap: quote.market_cap
    };
  });
  const eth = mapped.find((coin) => coin.id === 'eth-ethereum' || coin.symbol === 'eth');
  const totalMarketCap = Number(global.market_cap_usd);
  const ethDominance = eth && eth.market_cap && totalMarketCap
    ? (Number(eth.market_cap) / totalMarketCap) * 100
    : null;
  const markets = mapped
    .slice()
    .sort((a, b) => (Number(b.total_volume) || 0) - (Number(a.total_volume) || 0))
    .slice(0, 100);

  return {
    markets,
    global: {
      market_cap_percentage: {
        btc: global.bitcoin_dominance_percentage,
        eth: ethDominance
      },
      total_market_cap: { usd: global.market_cap_usd },
      total_volume: { usd: global.volume_24h_usd }
    },
    source: 'CoinPaprika'
  };
}

async function getCoinGeckoMarketData(options) {
  const headers = coingeckoHeaders(options.apiKey);
  const [markets, global] = await Promise.all([
    getJson(COINGECKO_MARKETS_URL, Object.assign({}, options, { headers })),
    getJson(COINGECKO_GLOBAL_URL, Object.assign({}, options, { headers }))
  ]);
  if (!Array.isArray(markets) || !global || !global.data) {
    throw new Error('CoinGecko returned an unexpected payload');
  }
  return { markets, global: global.data, source: 'CoinGecko' };
}

async function getCoinPaprikaMarketData(options) {
  const [tickers, global] = await Promise.all([
    getJson(COINPAPRIKA_TICKERS_URL, options),
    getJson(COINPAPRIKA_GLOBAL_URL, options)
  ]);
  return normalizeCoinPaprika(tickers, global);
}

async function getMarketData(options = {}) {
  const log = options.log || (() => {});
  const secrets = [options.apiKey];
  try {
    const data = await getCoinGeckoMarketData(options);
    log('Market data source: CoinGecko');
    return data;
  } catch (err) {
    const reason = redactSecrets(err && err.message ? err.message : 'unknown error', secrets);
    log('CoinGecko failed (' + reason + '). Falling back to CoinPaprika.');
    log('CoinGecko 요청에 실패해 CoinPaprika로 대체합니다.');
    try {
      const data = await getCoinPaprikaMarketData(options);
      log('Market data source: CoinPaprika');
      return data;
    } catch (fallbackErr) {
      const fallbackReason = redactSecrets(
        fallbackErr && fallbackErr.message ? fallbackErr.message : 'unknown error',
        secrets
      );
      throw new ConfigError([
        'Could not load market data from CoinGecko or CoinPaprika.',
        'CoinGecko: ' + reason,
        'CoinPaprika: ' + fallbackReason,
        'CoinGecko와 CoinPaprika 모두에서 시세 데이터를 가져오지 못했습니다.'
      ].join('\n'));
    }
  }
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const n = Number(value);
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function usd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function compactUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const n = Number(value);
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return usd(n);
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240);
}

function buildInsight({ markets, global, source }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const btc = markets.find(c => c.id === 'bitcoin' || c.id === 'btc-bitcoin' || c.symbol === 'btc');
  const eth = markets.find(c => c.id === 'ethereum' || c.id === 'eth-ethereum' || c.symbol === 'eth');
  const stableSymbols = new Set(['usdt', 'usdc', 'dai', 'usde', 'fdusd', 'tusd', 'usds', 'busd']);
  const sourceLabel = source === 'CoinPaprika' ? 'CoinPaprika public API' : 'CoinGecko public API';

  const volatile = markets
    .filter(c => c && !stableSymbols.has(String(c.symbol).toLowerCase()))
    .filter(c => c.price_change_percentage_24h !== null && c.total_volume && c.market_cap)
    .sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h))
    .slice(0, 3);

  const btcDominance = global.market_cap_percentage?.btc;
  const ethDominance = global.market_cap_percentage?.eth;
  const totalMarketCap = global.total_market_cap?.usd;
  const totalVolume = global.total_volume?.usd;

  const dominanceComment = btcDominance >= 55
    ? 'BTC dominance가 높은 구간입니다. 시장은 아직 알트코인 확산보다 비트코인 중심의 방어적 자금 배분을 선호하는 모습입니다.'
    : 'BTC dominance가 상대적으로 낮아지는 구간입니다. 위험 선호가 알트코인으로 확산되는지 확인할 필요가 있습니다.';

  const btcFlow = btc?.price_change_percentage_24h >= 0
    ? '비트코인이 24시간 기준 상승권에 있어 대형 자금의 위험자산 선호가 유지되는지 관찰할 만합니다.'
    : '비트코인이 24시간 기준 약세라면, 거대 자본은 단기적으로 현금성 자산 또는 방어적 포지션을 선호할 수 있습니다.';

  const moverLines = volatile.map((c, idx) => {
    const direction = c.price_change_percentage_24h >= 0 ? '상승 모멘텀' : '하락 변동성';
    const strategy = c.price_change_percentage_24h >= 0
      ? '전고점 돌파 후 거래량이 유지될 때만 추격 관찰, 실패 시 빠른 손절 기준 필요'
      : '급락 후 거래량 감소와 반등 캔들 확인 전까지 저점 예측 매수 금지';
    return `### ${idx + 1}. ${c.name} (${String(c.symbol).toUpperCase()})\n- 현재가: ${usd(c.current_price)}\n- 24시간 변동률: ${pct(c.price_change_percentage_24h)}\n- 7일 변동률: ${pct(c.price_change_percentage_7d_in_currency)}\n- 거래대금: ${compactUsd(c.total_volume)}\n- 관찰 포인트: ${direction}. ${strategy}.`;
  }).join('\n\n');

  const title = `Crypto Capital Flow Brief: Bitcoin, Macro Liquidity and High-Volatility Coins (${date})`;
  const body = `# ${title}\n\n## 1. 오늘의 시장 온도\n- 전체 가상화폐 시가총액: ${compactUsd(totalMarketCap)}\n- 전체 24시간 거래대금: ${compactUsd(totalVolume)}\n- BTC dominance: ${pct(btcDominance)}\n- ETH dominance: ${pct(ethDominance)}\n- Bitcoin: ${usd(btc?.current_price)} / 24h ${pct(btc?.price_change_percentage_24h)} / 7d ${pct(btc?.price_change_percentage_7d_in_currency)}\n- Ethereum: ${usd(eth?.current_price)} / 24h ${pct(eth?.price_change_percentage_24h)} / 7d ${pct(eth?.price_change_percentage_7d_in_currency)}\n\n## 2. 거대 자본과 세계경제 흐름 해석\n${dominanceComment}\n\n${btcFlow}\n\n최근 가상화폐 시장은 단순한 개인 투자 심리보다, 달러 유동성, ETF/기관성 수요, 금리 기대, 위험자산 선호 변화와 함께 움직이는 경향이 강합니다. 따라서 비트코인의 방향성과 BTC dominance는 거대 자본이 위험을 늘리는지, 아니면 알트코인보다 대형 자산에만 머무르는지 판단하는 핵심 신호로 볼 수 있습니다.\n\n## 3. 미친 변동률을 보이는 코인 2~3개 관찰 목록\n${moverLines}\n\n## 4. 트레이딩 제안이 아니라, 리스크 관리 중심의 관찰 시나리오\n- 레버리지는 피하고, 변동성 코인은 작은 비중으로만 접근합니다.\n- 24시간 변동률만 보고 진입하지 말고, 거래대금 유지 여부와 BTC 방향을 함께 확인합니다.\n- 급등 코인은 눌림 후 재돌파, 급락 코인은 거래량 둔화 후 반등 확인이 더 안전합니다.\n- 손절 기준을 먼저 정하지 못하면 진입하지 않는 것이 좋습니다.\n\n*이 글은 자동화된 시장 데이터 분석이며 투자 조언이 아닙니다. 모든 투자의 책임은 본인에게 있습니다.*\n\nData source: ${sourceLabel}. Published automatically to Hive blockchain.`;

  return { title, body };
}

function buildComment(username, title, body) {
  const tags = ['crypto', 'bitcoin', 'trading', 'market', 'korea'];
  const permlink = slug('crypto-capital-flow-' + new Date().toISOString().replace(/[:.]/g, '-'));
  return {
    parent_author: '',
    parent_permlink: tags[0],
    author: username,
    permlink,
    title,
    body,
    json_metadata: JSON.stringify({
      tags,
      app: 'hive-auto-blog/1.0',
      format: 'markdown',
      description: 'Automated crypto market capital flow brief with high-volatility coin watchlist.'
    })
  };
}

async function run(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv;
  const log = options.log || ((...args) => console.log(...args));
  const dryRun = options.dryRun != null ? options.dryRun : isDryRun(env, argv);
  const secrets = secretValues(env);
  const username = normalizeHiveUser(env.HIVE_USER);

  if (!username) throw new ConfigError(missingUserMessage());
  if (!isValidHiveAccountName(username)) throw new ConfigError(invalidUserMessage());

  const privateKey = parsePostingKey(env.HIVE_POSTING_KEY);
  const publicKey = privateKey.createPublic(ADDRESS_PREFIX).toString();
  const client = options.client || createClient();

  let accounts;
  try {
    accounts = await client.database.getAccounts([username]);
  } catch (err) {
    throw new ConfigError(accountFetchFailedMessage(username, err, secrets));
  }

  const account = (Array.isArray(accounts) ? accounts : []).find((item) => item && item.name === username);
  if (!account) throw new ConfigError(accountNotFoundMessage(username));

  const authorityError = checkPostingKey(account, publicKey);
  if (authorityError) throw new ConfigError(authorityError);

  const data = await getMarketData({
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    random: options.random,
    maxAttempts: options.maxAttempts,
    apiKey: env.COINGECKO_API_KEY,
    log
  });
  const { title, body } = buildInsight(data);
  const comment = buildComment(username, title, body);

  if (dryRun) {
    log('Dry run: posting authority check passed for @' + username + '.');
    log('드라이런: @' + username + ' 계정의 포스팅 권한 확인을 통과했습니다.');
    log('Dry run: broadcast skipped. 글은 블록체인에 올리지 않습니다.');
    log('Title: ' + title);
    log('URL: https://hive.blog/@' + username + '/' + comment.permlink);
    log(body);
    return { dryRun: true, title, permlink: comment.permlink, author: username, source: data.source };
  }

  log('Broadcasting Hive post:', title);
  const result = await client.broadcast.comment(comment, privateKey);
  log('Included in block:', result.block_num);
  log('Posted successfully! URL: https://hive.blog/@' + username + '/' + comment.permlink);
  return { dryRun: false, title, permlink: comment.permlink, author: username, source: data.source, result };
}

function formatFailure(error) {
  if (error instanceof ConfigError) return error.message;
  if (error && error.stack) return error.stack;
  return String(error);
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error('Posting failed:');
    console.error(redactSecrets(formatFailure(error), secretValues(process.env)));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ConfigError,
  normalizeHiveUser,
  isValidHiveAccountName,
  isDryRun,
  redactSecrets,
  parsePostingKey,
  checkPostingKey,
  getJson,
  retryDelayMs,
  normalizeCoinPaprika,
  getMarketData,
  buildInsight,
  run
};
