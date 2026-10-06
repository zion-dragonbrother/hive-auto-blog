import os
import datetime
import json
import requests

HIVE_USER = os.getenv('HIVE_USER')
# 실제 블록체인 서명 기능은 복잡하니, 
# 테스트를 위해 먼저 'API 연결 성공'을 블로그에 찍어보겠습니다.
# 이 단계가 성공하면 그다음 서명 로직을 넣겠습니다.

def test_api_connection():
    url = "https://api.hive.blog"
    payload = {
        "jsonrpc": "2.0",
        "method": "condenser_api.get_dynamic_global_properties",
        "params": [],
        "id": 1
    }
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        print(f"✅ Hive 블록체인 연결 성공! 현재 블록 높이: {response.json()['result']['head_block_number']}")
    else:
        print("❌ 연결 실패")

if __name__ == '__main__':
    test_api_connection()
