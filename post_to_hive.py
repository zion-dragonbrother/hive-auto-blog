import os
from beem import Hive
import datetime

HIVE_USER = os.getenv('HIVE_USER')
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')

def make_post():
    if not POSTING_KEY or not HIVE_USER:
        print("에러: 인증 정보가 없습니다.")
        return

    # Hive 연결
    hive = Hive(keys=[POSTING_KEY])
    
    # 포스트 내용
    title = f"AI 자동 포스팅 테스트 - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    body = "이 글은 GitHub Actions를 통해 블록체인에 성공적으로 올라간 자동 포스팅 테스트입니다! 수익화 시스템이 가동되었습니다!"
    permlink = f"ai-post-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # 실제 전송
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
