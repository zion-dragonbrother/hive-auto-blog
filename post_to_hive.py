import os
from beem import Hive
import datetime

# 환경변수에서 가져오기
HIVE_USER = os.getenv('HIVE_USER')
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')

def make_post():
    if not POSTING_KEY or not HIVE_USER:
        print("Missing credentials")
        return

    # Hive 연결
    hive = Hive(keys=[POSTING_KEY])
    
    # 포스트 내용
    title = f"AI 자동 포스팅 테스트 - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    body = "이 글은 GitHub Actions와 Claude Code CLI를 통해 자동으로 작성된 테스트 포스팅입니다. 이제 시스템이 완벽히 작동합니다!"
    permlink = f"ai-post-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # 블록체인에 전송
    hive.post(
        title=title,
        body=body,
        author=HIVE_USER,
        permlink=permlink,
        tags=["ai", "kr"]
    )
    print(f"✅ 포스팅 성공: {title}")

if __name__ == '__main__':
    make_post()
