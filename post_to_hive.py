import os
from beem import Hive
from beem.comment import Comment
import datetime

# 환경변수에서 정보 가져오기
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')
HIVE_USER = os.getenv('HIVE_USER')

def make_post():
    # 1. Hive 연결
    hive = Hive(keys=[POSTING_KEY])
    
    # 2. 간단한 포스트 생성 (클로드 명령어 대체 - 예시)
    title = f"오늘의 AI 트렌드 요약 - {datetime.datetime.now().strftime('%Y-%m-%d')}"
    body = "안녕하세요! AI 자동화 시스템으로 작성된 오늘의 짧은 글입니다. 앞으로 더 유익한 정보를 전달해 드릴게요!"
    permlink = f"ai-trend-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # 3. 실제 포스팅 (하이브 블록체인에 전송)
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
