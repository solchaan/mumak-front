# Mumak 배포

mumak-front와 mumak-back을 같은 부모 폴더에 체크아웃한다.
이 폴더의 `.env`에 32자 이상의 `API_TOKEN`을 설정한다. 토큰은 내부 프록시 통신에만 사용하며 Git에 추가하지 않는다.

```sh
docker compose config --quiet
docker compose up -d --build --wait
```

기존 `game-moyeo-app_default` 네트워크와 공유 Caddy가 필요하다.
Caddy에 `Caddyfile.mumak`의 라우트를 반영한다. 공개 주소는 https://mumak.noroo.kr 이며 프론트와 API 모두 사용자 인증 없이 접근한다.
프로젝트 조회·저장·삭제도 공개된다. 데이터는 기존 `mumak_projects` 볼륨을 사용한다.
현재 운영 설정은 `/Users/nochansol/mumak-docker`에 있으며 이 폴더는 재현 가능한 배포 설정 사본이다.
