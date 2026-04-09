## 배포

> **모든 배포는 반드시 GitHub Actions (main push)로만 수행한다. 수동 배포 절대 금지.**

| 대상 | 워크플로 | 트리거 | 배포 대상 |
|------|----------|--------|-----------|
| 백엔드 | `deploy-backend.yml` | `main` push + `backend/**` 변경 | OCI VM (SSH + systemd) |
| 프론트엔드 | `deploy-frontend.yml` | `main` push + `frontend/**` 변경 | Cloudflare Pages |

- `wrangler pages deploy` 로컬 실행 금지
- 직접 SSH 접속 후 수동 배포 금지
- 데이터 파이프라인 스크립트(`scripts/`)는 배포 파이프라인과 별도 — OCI VM에서 수동 실행
