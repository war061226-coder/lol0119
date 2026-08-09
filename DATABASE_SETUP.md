# 무료 DB에 기록 저장하기 (Neon 기준)

기본적으로 이 앱은 `data/manual-players.json`, `data/balance-history.json` 처럼
로컬 드라이브의 JSON 파일에 데이터를 저장합니다. 아래 과정을 따라하면
**무료 PostgreSQL(Neon)** 에 저장하도록 바꿀 수 있어요. 코드는 이미 준비되어 있고,
`DATABASE_URL` 환경변수만 설정하면 자동으로 DB 저장 방식으로 전환됩니다.
(설정하지 않으면 지금처럼 로컬 파일에 저장되니 안심하세요.)

## 1. Neon 무료 DB 만들기

1. https://neon.tech 접속 후 회원가입 (GitHub/Google 계정으로 간편 가입 가능)
2. "New Project" 클릭 → 프로젝트 이름 아무거나 입력 (예: `lol-balancer`) → 리전은 가까운 곳(Singapore 등) 선택 → 생성
3. 생성되면 대시보드에 **Connection string**이 보여요. `psql` 드롭다운 대신
   `postgresql://...` 형태로 시작하는 문자열을 복사하세요.
   예시: `postgresql://neondb_owner:abcd1234@ep-cool-water-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Neon 무료 플랜은 카드 등록 없이 바로 사용 가능하며, 용량/컴퓨팅 시간 한도 내에서
이런 소규모 팀 내전 관리 용도로는 충분합니다.

## 2. 프로젝트에 연결 문자열 등록

1. 프로젝트 루트에 있는 `.env.example` 파일을 복사해서 같은 위치에 `.env` 파일을 만드세요.
2. `.env` 파일을 열어 `DATABASE_URL=` 뒤에 방금 복사한 연결 문자열을 붙여넣으세요.

```
DATABASE_URL=postgresql://neondb_owner:abcd1234@ep-cool-water-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

`.env` 파일은 `.gitignore`에 이미 등록되어 있어 git에는 올라가지 않습니다.

## 3. 패키지 설치 및 테이블 생성

터미널에서 프로젝트 폴더로 이동한 뒤:

```bash
npm install
npm run db:push
```

`npm run db:push`를 실행하면 `shared/schema.ts`에 정의된 테이블
(players, teams, balance_results, presets, balance_settings)이
Neon DB에 자동으로 생성됩니다.

## 4. 실행

```bash
npm run dev
```

콘솔에 아래 메시지가 뜨면 정상적으로 DB에 연결된 것입니다.

```
✅ PostgreSQL 데이터베이스에 연결되어 데이터를 저장합니다.
```

이 메시지 대신 아래처럼 뜬다면 `.env`에 `DATABASE_URL`이 제대로 설정되지 않은 것이니
1~2번 과정을 다시 확인해주세요.

```
💾 DATABASE_URL이 없어 로컬 JSON 파일(data 폴더)에 데이터를 저장합니다.
```

## 5. (선택) Windows 실행파일(.exe)로 배포하는 경우

`.env` 파일은 exe와 같은 폴더에 두면 됩니다 (`dotenv`가 실행 시 자동으로 읽습니다).
또는 exe를 실행하기 전에 시스템 환경변수로 `DATABASE_URL`을 등록해도 동작합니다.

## 참고: 기존 로컬 데이터 옮기기

이미 `data/manual-players.json`에 선수 데이터가 쌓여있다면, DB 전환 후에는
새로 선수를 등록해야 합니다(자동 이관 기능은 포함되어 있지 않습니다). 소수 인원이라면
직접 다시 입력하는 게 가장 빠르고, 인원이 많다면 이관 스크립트 작성을 요청해주세요.

## 다른 무료 DB를 쓰고 싶다면?

Supabase, Railway 등 다른 PostgreSQL 호스팅도 연결 문자열(`postgresql://...`)만
`DATABASE_URL`에 넣으면 그대로 동작합니다 (모두 표준 PostgreSQL 프로토콜을 쓰기 때문).
다만 `server/db.ts`는 Neon 전용 HTTP 드라이버(`@neondatabase/serverless`)를 쓰고 있어서,
Neon이 아닌 다른 DB를 쓸 경우 일반 `pg` 드라이버로 바꿔야 할 수 있어요 — 필요하면 말씀해주세요.
