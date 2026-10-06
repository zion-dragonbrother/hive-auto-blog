import os
import json
import datetime
import requests

POSTING_KEY = os.getenv('HIVE_POSTING_KEY')
HIVE_USER = os.getenv('HIVE_USER')
HIVE_API = 'https://api.hive.blog'

def make_post():
    # 간단한 API 연결 테스트
    data = {
        "jsonrpc": "2.0",
        "method": "condenser_api.get_dynamic_global_properties",
        "params": [],
        "id": 1
    }
    response = requests.post(HIVE_API, json=data)
    if response.status_code == 200:
        print("Hive API 연결 성공!")
        print("포스팅 로직은 현재 보안 키 서명 단계를 위해 가벼운 대체 라이브러리 검토 중입니다.")
    else:
        print("연결 실패")

if __name__ == '__main__':
    make_post()
