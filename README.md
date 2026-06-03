# 테니스 예약 링크

테니스장별 예약 오픈 시간을 계산하고, 코트별 예약 페이지로 빠르게 이동하는 React 웹앱입니다.

## 실행

```bash
npm install
npm run dev
```

## 배포

Vercel은 Vite 앱으로 자동 배포할 수 있습니다.

```bash
npm run build
npx vercel --prod
```

Supabase는 현재 앱에서는 필수 백엔드가 아닙니다. 추후 로그인, 공유 즐겨찾기, 예약 기록 저장을 붙일 때 `.env`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 설정해 연결할 수 있습니다.

## 포함된 기능

- 다음 예약 오픈 카운트다운
- 장소/코트 유형 필터
- 코트별 예약 링크
- 즐겨찾기 저장
- 장소별 개인 메모 저장
- 캘린더 파일 다운로드
- 브라우저 알림 권한 요청
