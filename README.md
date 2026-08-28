# PrompTune Chrome 확장 (MVP)

## 이게 뭔가요

웹앱(Next.js)과 별개로 만든 **독립 실행형 Chrome 확장**이에요. 백엔드(`/api/execute`, `/api/improve`, `/api/auth/login`)를 웹앱과 그대로 공유해서 씁니다.

## 포함된 기능

1. **팝업**(툴바 아이콘 클릭) — 로그인 → 프롬프트 입력 → "프롬프트 다듬기"(개선안 미리보기) 또는 "바로 실행"(AI 응답 받기) → 결과를 현재 탭의 입력창에 바로 붙여넣거나 복사
2. **콘텐츠 스크립트**(모든 사이트에서 동작) — 아무 사이트의 `textarea`/`input`/`contenteditable`에 포커스하면 우측 하단에 작은 **"✦ PrompTune"** 버튼이 뜨고, 누르면 `/api/improve` 결과를 팝오버로 보여줌. "적용" 누르면 그 입력창 내용이 바로 교체됨

## 안 되는 것 (지금은 MVP라 뺀 부분)

- **정확한 글자 위치에 밑줄 긋기**(Grammarly처럼) — 이건 사이트마다 DOM이 달라서 훨씬 오래 걸리는 작업이라 이번 MVP엔 없어요. 지금은 "버튼 누르면 전체 프롬프트를 다듬어주는" 방식입니다
- 대시보드/파일관리/히스토리/설정 등 웹앱의 나머지 화면 — 확장 안에 옮기지 않았어요. 필요하면 팝업에 "웹앱 열기" 링크만 추가하는 걸 추천드려요

## 설치 방법 (로컬 테스트)

1. `chrome://extensions` 접속
2. 우측 상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭 → 이 폴더(`promptune-extension`) 선택
4. 설치되면 자동으로 옵션 페이지가 뜸 — 백엔드 주소 확인(기본값 `http://localhost:8080`)

## ⚠️ 반드시 해야 하는 설정 — 백엔드 CORS

확장 프로그램은 `chrome-extension://<확장ID>`라는 **새로운 오리진**으로 요청을 보내요. 지금 백엔드 CORS 허용 목록(`CORS_ORIGINS` 환경변수)에 이 오리진이 없으면 **모든 API 요청이 CORS 에러로 막힙니다.**

1. `chrome://extensions`에서 이 확장의 **ID 복사** (예: `abcdefghijklmnopqrstuvwxyzabcdef`)
2. 백엔드 `.env`(또는 배포 환경변수)의 `CORS_ORIGINS`에 추가:
   ```
   CORS_ORIGINS=http://localhost:3000,chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
   ```
3. 백엔드 재시작

이 작업은 형기님께 요청하시면 될 것 같아요 — `SecurityConfig.java`가 `corsOrigins.split(",")`로 이 값을 그대로 읽고 있어서, 프론트/백엔드 코드 수정 없이 환경변수만 추가하면 됩니다.

## 다음 단계로 갈만한 것

- 실제 여러 사람이 쓰려면 **Chrome 웹스토어 등록** 필요 (심사 대기 있음, 별도 준비 필요)
- 정확한 위치 밑줄(Grammarly 스타일)까지 가려면 사이트별 DOM 대응 작업 추가 필요 — 예전에 말씀드렸던 것처럼 사이트 하나당 예상보다 오래 걸릴 수 있어요
