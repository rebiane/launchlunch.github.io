# lunchLaunch

친구들과 식당 후보를 모으고, 밴픽과 미니게임으로 오늘의 점심을 정하는 웹 앱입니다.

- 초대 링크로 함께 참여
- 주변 식당 검색과 직접 추가
- 8가지 3D 미니게임과 게임 미리보기

## 실행

```sh
npm install
npm run dev
```

## 배포

Cloudflare Workers에서 서비스합니다.

```sh
npm run deploy
```

개인 설정과 API 키는 로컬 환경변수 또는 서버 Secret으로 관리하며 저장소에 포함하지 않습니다.

## 라이선스 안내

3D 렌더링에 Three.js(MIT), 일부 음식 모델에 Kenney Food Kit(CC0)를 사용합니다. 각 라이선스는 `public/vendor/THREE-LICENSE.txt`, `public/assets/food/LICENSE.txt`에서 확인할 수 있습니다.
