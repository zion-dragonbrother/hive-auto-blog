const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const dhive = require('@hiveio/dhive');
const {
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
} = require('./post_to_hive');

const HANGUL = /[가-힣]/;

function jsonResponse(status, body, headers = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const value = lower[String(name).toLowerCase()];
        return value == null ? null : value;
      }
    },
    json: async () => body
  };
}

const marketsFixture = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 100,
    price_change_percentage_24h: 1.5,
    price_change_percentage_7d_in_currency: -2,
    total_volume: 5e9,
    market_cap: 2e12
  },
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    current_price: 50,
    price_change_percentage_24h: -3,
    price_change_percentage_7d_in_currency: 4,
    total_volume: 2e9,
    market_cap: 5e11
  },
  {
    id: 'solana',
    symbol: 'sol',
    name: 'Solana',
    current_price: 20,
    price_change_percentage_24h: 15,
    price_change_percentage_7d_in_currency: 10,
    total_volume: 1e9,
    market_cap: 1e11
  }
];

const globalFixture = {
  market_cap_percentage: { btc: 60, eth: 15 },
  total_market_cap: { usd: 3e12 },
  total_volume: { usd: 1e11 }
};

function coingeckoFetch() {
  return async (url) => {
    if (String(url).includes('/global')) return jsonResponse(200, { data: globalFixture });
    if (String(url).includes('coingecko.com')) return jsonResponse(200, marketsFixture);
    throw new Error('unexpected url ' + url);
  };
}

function postingAccount(name, publicKey, weight = 1, threshold = 1) {
  return {
    name,
    posting: {
      weight_threshold: threshold,
      account_auths: [],
      key_auths: [[publicKey, weight]]
    }
  };
}

test('normalizes Hive usernames and rejects invalid ones', () => {
  assert.equal(normalizeHiveUser('  @Alice  '), 'alice');
  assert.equal(normalizeHiveUser('@@@'), '');
  assert.equal(isValidHiveAccountName('alice'), true);
  assert.equal(isValidHiveAccountName('good.user'), true);
  assert.equal(isValidHiveAccountName('ab'), false);
  assert.equal(isValidHiveAccountName('ab.cd'), false);
  assert.equal(isValidHiveAccountName('Alice'), false);
  assert.equal(isValidHiveAccountName('this-name-is-too-long'), false);
});

test('dry-run flag accepts the workflow boolean and a CLI flag', () => {
  assert.equal(isDryRun({ DRY_RUN: 'false' }, ['node', 'post_to_hive.js']), false);
  assert.equal(isDryRun({ DRY_RUN: 'true' }, ['node', 'post_to_hive.js']), true);
  assert.equal(isDryRun({ DRY_RUN: 'false' }, ['node', 'post_to_hive.js', '--dry-run']), true);
  assert.equal(isDryRun({}, ['node', 'post_to_hive.js']), false);
});

test('posting key parser accepts WIF and never echoes the secret', () => {
  const wif = dhive.PrivateKey.fromSeed('parser-check').toString();
  const parsed = parsePostingKey('  ' + wif + '\n');
  assert.equal(parsed.createPublic('STM').toString().startsWith('STM'), true);

  for (const raw of ['', '   ', 'STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA', 'not-a-key']) {
    assert.throws(() => parsePostingKey(raw), (err) => {
      assert.equal(err instanceof ConfigError, true);
      if (raw.trim()) assert.equal(err.message.includes(raw.trim()), false);
      assert.match(err.message, HANGUL);
      assert.match(err.message, /WIF|5/);
      return true;
    });
  }
});

test('posting authority check distinguishes a missing key from a low weight', () => {
  const privateKey = dhive.PrivateKey.fromSeed('authority-check');
  const publicKey = privateKey.createPublic('STM').toString();
  const other = dhive.PrivateKey.fromSeed('other-key').createPublic('STM').toString();
  assert.equal(checkPostingKey(postingAccount('alice', publicKey), publicKey), null);

  const mismatch = checkPostingKey(postingAccount('alice', other), publicKey);
  assert.match(mismatch, /posting\.key_auths/);
  assert.match(mismatch, HANGUL);
  assert.equal(mismatch.includes(privateKey.toString()), false);
  assert.match(mismatch, new RegExp(publicKey));

  const weak = checkPostingKey(postingAccount('alice', publicKey, 1, 2), publicKey);
  assert.match(weak, /threshold \(2\)/);
  assert.match(weak, HANGUL);
});

test('retries CoinGecko 429 and 5xx, and does not retry other 4xx', async () => {
  assert.equal(retryDelayMs(0, { headers: { get: () => '3' } }, () => 0), 3000);
  assert.equal(retryDelayMs(1, null, () => 0), 2000);

  let serverErrors = 0;
  const serverBody = await getJson('https://example.test/markets', {
    random: () => 0,
    sleep: async () => {},
    fetchImpl: async () => {
      serverErrors += 1;
      if (serverErrors < 3) return jsonResponse(503, {});
      return jsonResponse(200, { ok: true });
    }
  });
  assert.deepEqual(serverBody, { ok: true });
  assert.equal(serverErrors, 3);

  let rateLimits = 0;
  const sleeps = [];
  await getJson('https://example.test/limited', {
    random: () => 0,
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => {
      rateLimits += 1;
      if (rateLimits === 1) return jsonResponse(429, {}, { 'retry-after': '2' });
      return jsonResponse(200, { ok: true });
    }
  });
  assert.deepEqual(sleeps, [2000]);

  let missing = 0;
  await assert.rejects(
    () => getJson('https://example.test/missing', {
      sleep: async () => {},
      fetchImpl: async () => {
        missing += 1;
        return jsonResponse(404, {});
      }
    }),
    /HTTP 404/
  );
  assert.equal(missing, 1);
});

test('sends the CoinGecko demo header and falls back to CoinPaprika', async () => {
  const seen = [];
  const data = await getMarketData({
    apiKey: 'demo-key-value',
    sleep: async () => {},
    log: () => {},
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), key: init.headers['x-cg-demo-api-key'] || null });
      return coingeckoFetch()(url);
    }
  });
  assert.equal(data.source, 'CoinGecko');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((call) => call.key), ['demo-key-value', 'demo-key-value']);

  const anonymous = [];
  await getMarketData({
    sleep: async () => {},
    log: () => {},
    fetchImpl: async (url, init) => {
      anonymous.push(init.headers['x-cg-demo-api-key']);
      return coingeckoFetch()(url);
    }
  });
  assert.deepEqual(anonymous, [undefined, undefined]);

  const logs = [];
  const fallback = await getMarketData({
    apiKey: 'demo-key-value',
    sleep: async () => {},
    random: () => 0,
    maxAttempts: 2,
    log: (...args) => logs.push(args.join(' ')),
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes('coingecko.com')) return jsonResponse(429, { error: 'demo-key-value' });
      if (target.includes('/tickers')) {
        return jsonResponse(200, [
          {
            id: 'btc-bitcoin',
            name: 'Bitcoin',
            symbol: 'BTC',
            quotes: { USD: { price: 10, volume_24h: 100, market_cap: 1000, percent_change_24h: 1, percent_change_7d: 2 } }
          },
          {
            id: 'eth-ethereum',
            name: 'Ethereum',
            symbol: 'ETH',
            quotes: { USD: { price: 5, volume_24h: 40, market_cap: 250, percent_change_24h: -4, percent_change_7d: 3 } }
          }
        ]);
      }
      if (target.includes('/global')) {
        return jsonResponse(200, {
          market_cap_usd: 2000,
          volume_24h_usd: 300,
          bitcoin_dominance_percentage: 50
        });
      }
      throw new Error('unexpected url ' + target);
    }
  });
  assert.equal(fallback.source, 'CoinPaprika');
  assert.equal(fallback.markets[0].symbol, 'btc');
  assert.equal(fallback.global.market_cap_percentage.eth, 12.5);
  const rendered = logs.join('\n');
  assert.match(rendered, /CoinPaprika/);
  assert.match(rendered, HANGUL);
  assert.equal(rendered.includes('demo-key-value'), false);
  const insight = buildInsight(fallback);
  assert.match(insight.body, /CoinPaprika public API/);
});

test('CoinPaprika normalization sorts by volume', () => {
  const normalized = normalizeCoinPaprika([
    {
      id: 'eth-ethereum',
      name: 'Ethereum',
      symbol: 'ETH',
      quotes: { USD: { price: 5, volume_24h: 10, market_cap: 250, percent_change_24h: 1, percent_change_7d: 1 } }
    },
    {
      id: 'btc-bitcoin',
      name: 'Bitcoin',
      symbol: 'BTC',
      quotes: { USD: { price: 9, volume_24h: 90, market_cap: 1000, percent_change_24h: 2, percent_change_7d: -1 } }
    }
  ], {
    market_cap_usd: 2000,
    volume_24h_usd: 100,
    bitcoin_dominance_percentage: 55
  });
  assert.equal(normalized.markets[0].id, 'btc-bitcoin');
  assert.equal(normalized.markets[0].price_change_percentage_7d_in_currency, -1);
  assert.equal(normalized.global.total_volume.usd, 100);
});

test('dry run does everything except broadcast', async () => {
  const privateKey = dhive.PrivateKey.fromSeed('dry-run-success');
  const wif = privateKey.toString();
  const publicKey = privateKey.createPublic('STM').toString();
  let broadcasts = 0;
  let lookedUp = null;
  const logs = [];
  const result = await run({
    env: {
      HIVE_USER: '@Alice',
      HIVE_POSTING_KEY: wif,
      COINGECKO_API_KEY: 'demo-key-value',
      DRY_RUN: 'false'
    },
    argv: ['node', 'post_to_hive.js', '--dry-run'],
    sleep: async () => {},
    log: (...args) => logs.push(args.join(' ')),
    fetchImpl: coingeckoFetch(),
    client: {
      database: {
        async getAccounts(names) {
          lookedUp = names;
          return [postingAccount('alice', publicKey)];
        }
      },
      broadcast: {
        async comment() {
          broadcasts += 1;
          return { block_num: 1 };
        }
      }
    }
  });

  assert.deepEqual(lookedUp, ['alice']);
  assert.equal(broadcasts, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.author, 'alice');
  assert.match(result.permlink, /^crypto-capital-flow-/);
  const rendered = logs.join('\n');
  assert.match(rendered, /broadcast skipped/);
  assert.match(rendered, HANGUL);
  assert.match(rendered, /CoinGecko public API/);
  assert.equal(rendered.includes(wif), false);
  assert.equal(rendered.includes('demo-key-value'), false);
});

test('a matching key broadcasts when dry run is off', async () => {
  const privateKey = dhive.PrivateKey.fromSeed('live-post');
  const wif = privateKey.toString();
  const publicKey = privateKey.createPublic('STM').toString();
  let signedWith = null;
  const result = await run({
    env: { HIVE_USER: 'alice', HIVE_POSTING_KEY: wif, DRY_RUN: 'false' },
    argv: ['node', 'post_to_hive.js'],
    sleep: async () => {},
    log: () => {},
    fetchImpl: coingeckoFetch(),
    client: {
      database: {
        async getAccounts() {
          return [postingAccount('alice', publicKey)];
        }
      },
      broadcast: {
        async comment(comment, key) {
          signedWith = key;
          assert.equal(comment.author, 'alice');
          assert.equal(comment.parent_permlink, 'crypto');
          return { block_num: 42 };
        }
      }
    }
  });
  assert.equal(result.dryRun, false);
  assert.equal(result.result.block_num, 42);
  assert.equal(signedWith.toString(), wif);
});

test('failed checks exit before broadcast and stay bilingual', async () => {
  const cases = [
    { env: { HIVE_USER: '', HIVE_POSTING_KEY: 'x' }, message: /HIVE_USER/ },
    { env: { HIVE_USER: '@ab', HIVE_POSTING_KEY: 'x' }, message: /not a valid Hive account name/ },
    { env: { HIVE_USER: 'alice', HIVE_POSTING_KEY: '' }, message: /HIVE_POSTING_KEY is not set/ },
    { env: { HIVE_USER: 'alice', HIVE_POSTING_KEY: 'STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA' }, message: /not a valid WIF/ }
  ];

  for (const item of cases) {
    let fetched = false;
    await assert.rejects(
      () => run({
        env: item.env,
        argv: ['node', 'script.js'],
        client: {
          database: {
            async getAccounts() {
              fetched = true;
              return [];
            }
          }
        }
      }),
      (err) => {
        assert.equal(err instanceof ConfigError, true);
        assert.match(err.message, item.message);
        assert.match(err.message, HANGUL);
        return true;
      }
    );
    assert.equal(fetched, false);
  }

  const wif = dhive.PrivateKey.fromSeed('missing-account').toString();
  await assert.rejects(
    () => run({
      env: { HIVE_USER: '@nobody12', HIVE_POSTING_KEY: wif, DRY_RUN: '1' },
      argv: ['node', 'script.js'],
      fetchImpl: async () => {
        throw new Error('market data should not be fetched');
      },
      client: {
        database: { async getAccounts() { return []; } },
        broadcast: { async comment() { throw new Error('broadcast should not be called'); } }
      }
    }),
    (err) => {
      assert.match(err.message, /was not found/);
      assert.match(err.message, /by_account/);
      assert.match(err.message, HANGUL);
      assert.equal(err.message.includes(wif), false);
      return true;
    }
  );

  const mismatchKey = dhive.PrivateKey.fromSeed('mismatch').toString();
  await assert.rejects(
    () => run({
      env: { HIVE_USER: 'alice', HIVE_POSTING_KEY: mismatchKey },
      argv: ['node', 'script.js'],
      client: {
        database: {
          async getAccounts() {
            return [postingAccount('alice', 'STM11111111111111111111111111111111111111111111111111')];
          }
        }
      }
    }),
    (err) => {
      assert.match(err.message, /posting\.key_auths/);
      assert.equal(err.message.includes(mismatchKey), false);
      return true;
    }
  );
});

test('redacts configured secrets from failure text', () => {
  const secret = '5secretvalue-that-must-not-leak';
  assert.equal(redactSecrets('boom ' + secret + ' end', [secret]).includes(secret), false);
  assert.match(redactSecrets('boom ' + secret, [secret]), /\[redacted\]/);
});

test('CLI exits non-zero for a missing user and does not print a key', () => {
  const secret = '5' + 'K'.repeat(50);
  const result = spawnSync(process.execPath, ['post_to_hive.js'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HIVE_USER: '',
      HIVE_POSTING_KEY: secret,
      DRY_RUN: '1'
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Posting failed:/);
  assert.match(result.stderr, /HIVE_USER/);
  assert.match(result.stderr, HANGUL);
  assert.equal(result.stderr.includes(secret), false);
  assert.equal(result.stdout.includes(secret), false);
});
