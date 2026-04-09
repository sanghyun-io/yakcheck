# 낱알식별 API 파라미터 필터링 검증 결과

> **테스트일**: 2026-04-09
> **API**: `MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03`
> **테스트 환경**: OCI API VM (ubuntu-dev-1), Node.js v22

---

## 요약

낱알 식별의 핵심 파라미터 6개(`drug_shape`, `color_class1`, `print_front`, `print_back`, `line_front`, `line_back`)가 **API 서버에서 무시**된다. 어떤 값을 전달하든 전체 25,423건이 반환된다.

작동하는 파라미터는 `item_name`, `entp_name`, `item_seq` 3개뿐이다.

---

## 테스트 방법

```javascript
// test-api.mjs — OCI VM에서 실행
const BASE = 'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03';
const qs = new URLSearchParams({ serviceKey: API_KEY, type: 'json', numOfRows: '1', pageNo: '1', ...params });
const res = await fetch(`${BASE}?${qs}`);
const data = await res.json();
// data.body.totalCount 로 필터링 여부 판정
```

**판정 기준**: `totalCount`가 기준선(25,423)과 동일하면 해당 파라미터는 필터로 작동하지 않음.

---

## 테스트 결과

### 기준선

| 테스트 | 파라미터 | totalCount | 판정 |
|--------|---------|:----------:|:----:|
| 기준선 | (없음) | 25,423 | - |

### 대조군 (작동하는 파라미터)

| 테스트 | 파라미터 | totalCount | 판정 |
|--------|---------|:----------:|:----:|
| item_name=타이레놀 | `item_name` | **4** | **작동** |
| entp_name=일동제약 | `entp_name` | **279** | **작동** |
| item_seq=200808876 | `item_seq` | **1** | **작동** |

### 검증 대상 (낱알 식별 핵심 파라미터)

| 테스트 | 파라미터 | totalCount | 판정 |
|--------|---------|:----------:|:----:|
| drug_shape=삼각형 | `drug_shape` | 25,423 | **미작동** |
| drug_shape=원형 | `drug_shape` | 25,423 | **미작동** |
| color_class1=파랑 | `color_class1` | 25,423 | **미작동** |
| color_class1=하양 | `color_class1` | 25,423 | **미작동** |
| print_front=TYLENOL | `print_front` | 25,423 | **미작동** |
| print_back=500 | `print_back` | 25,423 | **미작동** |

### 복합 조건

| 테스트 | 파라미터 | totalCount | 판정 |
|--------|---------|:----------:|:----:|
| drug_shape=원형 & color_class1=하양 | 모양+색상 | 25,423 | **미작동** (둘 다 무시) |
| item_name=타이레놀 & drug_shape=원형 | 이름+모양 | **4** | item_name만 작동, drug_shape 무시 |

---

## 결론

| 파라미터 | 용도 | 작동 여부 |
|---------|------|:---------:|
| `item_name` | 약 이름 | O |
| `entp_name` | 제조사명 | O |
| `item_seq` | 품목기준코드 | O |
| `drug_shape` | 모양 (원형/타원형 등) | **X** |
| `color_class1` | 앞면 색상 | **X** |
| `print_front` | 앞면 식별문자 | **X** |
| `print_back` | 뒷면 식별문자 | **X** |

낱알 식별의 핵심 기능인 모양/색상/식별문자 기반 검색이 API에서 지원되지 않으므로, **전체 데이터를 로컬 DB에 동기화한 뒤 직접 필터링하는 방식**으로 전환해야 한다.

---

## 대응 방안

**채택**: 로컬 DB 동기화 + 직접 필터링
- `yakcheck.pill_identifications` 테이블 생성
- API에서 전체 25,423건을 페이지네이션하여 DB에 적재
- `GET /identify` 엔드포인트에서 PostgreSQL 쿼리로 직접 필터링
- 기존 패턴(drugs, contraindications 테이블)과 동일한 전략

---

*테스트 스크립트: `test-api.mjs`*
