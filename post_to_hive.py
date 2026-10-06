import os
import subprocess
import json
import requests
import datetime

# GitHub Secrets에서 가져오기
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')
HIVE_USER = os.getenv('HIVE_USER')
HIVE_API = 'https://api.hive.blog'

def ask_claude(prompt):
    """Claude Code CLI 호출 (GitHub Actions 환경에 설치 후 사용)"""
    try:
        result = subprocess.run(
            ['claude', '-p', prompt],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except Exception as e:
        print(f"Claude error: {e}")
        return "AI trends for today"

def make_post():
    if not POSTING_KEY or not HIVE_USER:
        print("Missing credentials")
        return

    # 1) 트렌딩 토픽 선정
    title = ask_claude("Give me one trending AI-related topic. Return only the title.")

    # 2) 본문 작성
    body = ask_claude(f"Write a 300-word blog post in markdown about '{title}'.")

    # 3) Hive 포스팅
    permlink = f"{datetime.datetime.utcnow():%Y-%m-%d-%H-%M-%S}-{title.lower().replace(' ', '-')}"
    ops = [[
        "comment",
        {
            "parent_author": "",
            "parent_permlink": "hive",
            "author": HIVE_USER,
            "permlink": permlink,
            "title": title,
            "body": body,
            "json_metadata": json.dumps({"tags": ["ai", "kr"]})
        }
    ]]

    # 여기서 실제 브로드캐스트 로직은 복잡하므로
    # 간단한 포스팅용 라이브러리를 사용하거나 API를 호출합니다.
    # (보안상 실제 서명 로직을 Python으로 직접 구현하려면 beem 라이브러리 필요)
    print(f"Would post to Hive: {title}")
    print(body)

if __name__ == '__main__':
    make_post()
