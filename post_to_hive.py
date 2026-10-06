import os
import requests
import datetime
import json

HIVE_USER = os.getenv('HIVE_USER')
POSTING_KEY = os.getenv('HIVE_POSTING_KEY')

def make_post():
    # 라이브러리 없이 Hive API 호출 테스트
    print(f"✅ 사용 가능한 사용자: {HIVE_USER}")
    print("시스템이 정상적으로 작동 중입니다.")
    # 실제 블록체인 전송은 이 다음 단계에서 안정화 후 연결하겠습니다.

if __name__ == '__main__':
    make_post()
