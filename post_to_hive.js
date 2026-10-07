const dhive = require('@hiveio/dhive');

const POSTING_KEY = process.env.HIVE_POSTING_KEY;
const HIVE_USER = (process.env.HIVE_USER || '').replace('@', '').trim();

const client = new dhive.Client([
  'https://api.hive.blog',
  'https://api.openhive.network',
  'https://rpc.mahdiyari.info',
  'https://api.deathwing.me'
]);

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

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'hive-auto-blog/1.0'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + url);
  return res.json();
}

async function getMarketData() {
  const marketsUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d';
  const globalUrl = 'https://api.coingecko.com/api/v3/global';
  const [markets, global] = await Promise.all([getJson(marketsUrl), getJson(globalUrl)]);
  return { markets, global: global.data };
}

function buildInsight({ markets, global }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const btc = markets.find(c => c.id === 'bitcoin') || markets.find(c => c.symbol === 'btc');
  const eth = markets.find(c => c.id === 'ethereum') || markets.find(c => c.symbol === 'eth');
  const stableSymbols = new Set(['usdt', 'usdc', 'dai', 'usde', 'fdusd', 'tusd', 'usds', 'busd']);

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
  const body = `# ${title}\n\n## 1. 오늘의 시장 온도\n- 전체 가상화폐 시가총액: ${compactUsd(totalMarketCap)}\n- 전체 24시간 거래대금: ${compactUsd(totalVolume)}\n- BTC dominance: ${pct(btcDominance)}\n- ETH dominance: ${pct(ethDominance)}\n- Bitcoin: ${usd(btc?.current_price)} / 24h ${pct(btc?.price_change_percentage_24h)} / 7d ${pct(btc?.price_change_percentage_7d_in_currency)}\n- Ethereum: ${usd(eth?.current_price)} / 24h ${pct(eth?.price_change_percentage_24h)} / 7d ${pct(eth?.price_change_percentage_7d_in_currency)}\n\n## 2. 거대 자본과 세계경제 흐름 해석\n${dominanceComment}\n\n${btcFlow}\n\n최근 가상화폐 시장은 단순한 개인 투자 심리보다, 달러 유동성, ETF/기관성 수요, 금리 기대, 위험자산 선호 변화와 함께 움직이는 경향이 강합니다. 따라서 비트코인의 방향성과 BTC dominance는 거대 자본이 위험을 늘리는지, 아니면 알트코인보다 대형 자산에만 머무르는지 판단하는 핵심 신호로 볼 수 있습니다.\n\n## 3. 미친 변동률을 보이는 코인 2~3개 관찰 목록\n${moverLines}\n\n## 4. 트레이딩 제안이 아니라, 리스크 관리 중심의 관찰 시나리오\n- 레버리지는 피하고, 변동성 코인은 작은 비중으로만 접근합니다.\n- 24시간 변동률만 보고 진입하지 말고, 거래대금 유지 여부와 BTC 방향을 함께 확인합니다.\n- 급등 코인은 눌림 후 재돌파, 급락 코인은 거래량 둔화 후 반등 확인이 더 안전합니다.\n- 손절 기준을 먼저 정하지 못하면 진입하지 않는 것이 좋습니다.\n\n*이 글은 자동화된 시장 데이터 분석이며 투자 조언이 아닙니다. 모든 투자의 책임은 본인에게 있습니다.*\n\nData source: CoinGecko public API. Published automatically to Hive blockchain.`;

  return { title, body };
}

async function main() {
  if (!POSTING_KEY || !HIVE_USER) {
    throw new Error('Missing HIVE_POSTING_KEY or HIVE_USER secret');
  }

  const data = await getMarketData();
  const { title, body } = buildInsight(data);
  const tags = ['crypto', 'bitcoin', 'trading', 'market', 'korea'];
  const permlink = slug('crypto-capital-flow-' + new Date().toISOString().replace(/[:.]/g, '-'));
  const privateKey = dhive.PrivateKey.fromString(POSTING_KEY.trim());

  const comment = {
    parent_author: '',
    parent_permlink: tags[0],
    author: HIVE_USER,
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

  console.log('Broadcasting Hive post:', title);
  const result = await client.broadcast.comment(comment, privateKey);
  console.log('Included in block:', result.block_num);
  console.log('Posted successfully! URL: https://hive.blog/@' + HIVE_USER + '/' + permlink);
}

main().catch(error => {
  console.error('Posting failed:', error);
  process.exit(1);
});
