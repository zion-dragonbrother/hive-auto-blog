import os
import datetime

# 환경변수에서 정보 가져오기
HIVE_USER = os.getenv('HIVE_USER')
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')

def make_post():
    if not POSTING_KEY or not HIVE_USER:
        print("Missing credentials")
        return

    # 이제 라이브러리 없이 순수 파이썬으로 동작 확인만 진행합니다.
    title = f"자동 포스팅 테스트 - {datetime.datetime.now().strftime('%Y-%m-%d')}"
    body = "이 글은 외부 라이브러리 없이 성공적으로 GitHub Actions에서 실행되었습니다."
    
    print(f"✅ 포스팅 준비 완료: {title}")
    print(f"✅ 본문 내용: {body}")
    # 여기에 실제 블록체인 전송 코드가 들어가야 하는데, 
    # 설치 에러를 피하기 위해 테스트 단계에서는 출력만 먼저 진행합니다.

if __name__ == '__main__':
    make_post()
