# hive-auto-blog

GitHub Actions posts a daily crypto market brief to Hive (`.github/workflows/hive-post.yml`).

## Secrets

Create these under **Settings → Secrets and variables → Actions**. Do not commit them.

| Secret | Required | Value |
| --- | --- | --- |
| `HIVE_USER` | yes | Hive account name **without** `@` (example: `alice`, not `@alice`). A pasted `@` is stripped and the name is lowercased. |
| `HIVE_POSTING_KEY` | yes | That account's **private posting key**. It is a WIF string that **starts with `5`**. |
| `COINGECKO_API_KEY` | no | CoinGecko **Demo** API key. Sent only as the `x-cg-demo-api-key` header. |

The posting key is the private key from Hive Keychain / HiveSigner labeled **Posting**. Do not use:

- the public key (it starts with `STM`)
- the owner, active, or memo private key (those also start with `5`, but they are not in `posting.key_auths`)

Before each broadcast the script loads the account and checks that the key's public key is in `posting.key_auths`. A mismatch prints an English and Korean message and exits without broadcasting. The private key is never printed.

`HIVE_USER`에 `@`를 붙이지 마세요. `HIVE_POSTING_KEY`에는 `5`로 시작하는 **포스팅 개인키**만 넣으세요. `STM`으로 시작하는 공개키나 owner/active/memo 키는 사용할 수 없습니다.

## Dry run

In the Actions tab, run **Auto Hive Post** and check **dry_run**. The job still validates the key and builds the post, then skips `broadcast`.

Locally, with the same environment variables:

```bash
npm ci
npm test
DRY_RUN=1 node post_to_hive.js
```

## Market data

CoinGecko is tried first (with retries on HTTP 429 and 5xx). If it is still unavailable, the post uses CoinPaprika.
