# yakcheck DB 스키마

> **Database**: `gamja_apps` (PostgreSQL 16)
> **Schema**: `yakcheck`
> **DB User**: `svc_yakcheck_runtime`
> **Last updated**: 2026-04-09

---

## 테이블 요약

| 테이블 | 레코드 수 | 용도 |
|--------|--------:|------|
| `drugs` | 22,976 | 약품 정보 (검색 대상) |
| `contraindications` | 1,271 | 성분 간 병용금기 규칙 |
| `sync_logs` | 2 | 데이터 동기화 로그 |

---

## drugs

약품 정보. 검색 + 성분코드 조회에 사용.

```
┌──────────────────────────────────────────────────────────────┐
│ drugs                                                        │
├──────────────────┬───────────────────┬────────────────────────┤
│ Column           │ Type              │ Note                   │
├──────────────────┼───────────────────┼────────────────────────┤
│ item_seq (PK)    │ VARCHAR(20)       │ 품목기준코드 (식약처)   │
│ item_name        │ VARCHAR(500)      │ 약품명                  │
│ entp_name        │ VARCHAR(200)      │ 제조사명                │
│ ingredient_codes │ TEXT[]            │ DUR 성분코드 배열       │
│ ingredient_names │ TEXT[]            │ 성분 한글명 배열        │
│ efficacy         │ TEXT              │ 효능효과 (e약은요)      │
│ usage_info       │ TEXT              │ 용법용량 (e약은요)      │
│ caution          │ TEXT              │ 주의사항 (e약은요)      │
│ image_url        │ TEXT              │ 약 이미지 URL          │
│ updated_at       │ TIMESTAMPTZ       │ 마지막 업데이트         │
└──────────────────┴───────────────────┴────────────────────────┘
```

### 데이터 소스별 기여

| 필드 | e약은요 | DUR 품목정보 |
|------|:-------:|:----------:|
| item_seq | O | O |
| item_name | O | O |
| entp_name | O | O |
| ingredient_codes | - | **O** |
| ingredient_names | - | **O** |
| efficacy | **O** | - |
| usage_info | **O** | - |
| caution | **O** | - |
| image_url | **O** | - |

### 데이터 현황

| 항목 | 수치 |
|------|-----:|
| 전체 약 | 22,976 |
| 성분코드 매핑됨 | 19,894 (86.6%) |
| 성분코드 미매핑 | 3,082 (13.4%) |
| 고유 D-code 수 | 970 |

### 인덱스

| 인덱스 | 타입 | 대상 | 용도 |
|--------|------|------|------|
| `drugs_pkey` | UNIQUE BTREE | `item_seq` | PK |
| `idx_drugs_name` | GIN (trigram) | `item_name` | 약 이름 검색 (ILIKE) |
| `idx_drugs_ingredient` | GIN | `ingredient_codes` | 성분코드로 약 조회 |

### 예시 데이터

```
item_seq: '200000913'
item_name: '코니트라캡슐(이트라코나졸)'
entp_name: '코오롱제약(주)'
ingredient_codes: {D000762}
ingredient_names: {이트라코나졸}
efficacy: NULL  (DUR에서만 온 약 — e약은요 미수록)
```

---

## contraindications

성분 간 병용금기 규칙. 두 성분(D-code)이 함께 복용 시 위험한 조합.

```
┌────────────────────────────────────────────────────────────────┐
│ contraindications                                              │
├──────────────────────┬───────────────┬─────────────────────────┤
│ Column               │ Type          │ Note                    │
├──────────────────────┼───────────────┼─────────────────────────┤
│ id (PK)              │ SERIAL        │ 자동 증가               │
│ ingredient_code_a    │ VARCHAR(20)   │ 성분A D-code (NOT NULL) │
│ ingredient_name_a    │ VARCHAR(200)  │ 성분A 한글명            │
│ ingredient_code_b    │ VARCHAR(20)   │ 성분B D-code (NOT NULL) │
│ ingredient_name_b    │ VARCHAR(200)  │ 성분B 한글명            │
│ contraindication_type│ VARCHAR(50)   │ 금기 유형               │
│ severity             │ VARCHAR(20)   │ 심각도 (현재 모두 critical) │
│ reason               │ TEXT          │ 금기 사유               │
└──────────────────────┴───────────────┴─────────────────────────┘
```

### UNIQUE 제약

`(ingredient_code_a, ingredient_code_b)` — 동일 성분 쌍은 1건만 저장.

### 인덱스

| 인덱스 | 타입 | 대상 | 용도 |
|--------|------|------|------|
| `contraindications_pkey` | UNIQUE BTREE | `id` | PK |
| `contraindications_..._key` | UNIQUE BTREE | `(code_a, code_b)` | 중복 방지 |
| `idx_contra_pair` | BTREE | `(code_a, code_b)` | 정방향 매칭 |
| `idx_contra_reverse` | BTREE | `(code_b, code_a)` | 역방향 매칭 |

### 매칭 방식

금기 쌍은 방향 없음 (A↔B = B↔A). 쿼리 시 양방향 검색:
```sql
WHERE (code_a, code_b) IN (...) OR (code_b, code_a) IN (...)
```

### 예시 데이터

```
ingredient_code_a: 'D000762'   (이트라코나졸)
ingredient_code_b: 'D000027'   (심바스타틴)
reason: '횡문근융해증 등 근육병증의 위험이 증가될 수 있다.'
severity: 'critical'
```

---

## sync_logs

데이터 동기화 작업 로그.

```
┌──────────────────────────────────────────────────────────────┐
│ sync_logs                                                    │
├──────────────────┬───────────────────┬────────────────────────┤
│ Column           │ Type              │ Note                   │
├──────────────────┼───────────────────┼────────────────────────┤
│ id (PK)          │ SERIAL            │ 자동 증가               │
│ sync_type        │ VARCHAR(50)       │ 동기화 유형             │
│ status           │ VARCHAR(20)       │ running/success/failed │
│ records_affected │ INTEGER           │ 처리된 레코드 수        │
│ error_message    │ TEXT              │ 에러 메시지             │
│ started_at       │ TIMESTAMPTZ       │ 시작 시각               │
│ finished_at      │ TIMESTAMPTZ       │ 완료 시각               │
└──────────────────┴───────────────────┴────────────────────────┘
```

---

## 테이블 관계

```
drugs 와 contraindications는 FK로 연결되지 않음 (느슨한 연결).
연결 키는 D-code (DUR 성분코드):

  drugs.ingredient_codes[]  ←──── D-code ────→  contraindications.ingredient_code_a
                                                 contraindications.ingredient_code_b

  조회 흐름:
  1. drugs에서 약 검색 (item_name ILIKE)
  2. 선택된 약들의 ingredient_codes[] 수집
  3. 모든 성분 쌍 조합 생성
  4. contraindications에서 매칭
```

---

## 데이터 소스 연결 (D-code)

```
DUR 품목정보 API  ──→  drugs.ingredient_codes (D-code 배열)
                         │
                         │  동일 D-code
                         │
DUR 성분정보 API  ──→  contraindications.ingredient_code_a/b
```

**연결 근거**: 동일 식약처 DUR 시스템이 발급한 성분코드 (D + 6자리).
품목 API와 성분 API 모두 같은 코드 체계를 사용하므로 **강한 연결**.

---

*Related*: [api-data-sources.md](./api-data-sources.md), [data-flow-diagram.md](./data-flow-diagram.md)
