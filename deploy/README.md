# Mumak 배포

운영 설정: `/Users/nochansol/mumak-docker`. 소스 사본: `mumak-front/deploy`.
프런트엔드와 백엔드는 같은 부모 디렉터리에 둡니다.
`.env`에 32자 이상 `API_TOKEN`을 설정합니다. 계정 등록용 관리자 토큰이며 프런트엔드에 전달하지 않습니다.

```sh
docker compose config --quiet
docker compose up -d --build --wait
```

공개 주소: https://mumak.noroo.kr · 로컬: http://localhost:5174
첫 화면에서 아이디와 비밀번호로 로그인해야 작업실에 접근할 수 있습니다.
Nginx는 클라이언트 Authorization 헤더를 그대로 전달합니다. 관리자 토큰 자동 주입은 금지합니다.
계정 생성은 `POST /api/auth/register`에 관리자 Bearer 토큰과 JSON `username`, `password`를 전송합니다.
비인증 `/api/projects` 요청은 401이어야 합니다.

기존 `game-moyeo-app_default` 네트워크와 공유 Caddy의 `mumak-web:80` 라우트를 사용합니다.
프로젝트와 계정은 `mumak_projects` 볼륨에 유지됩니다. `down -v`를 사용하지 마세요.
`.env`, `access-credentials.txt`, 백업 폴더는 Git에 추가하거나 공유하지 마세요.
