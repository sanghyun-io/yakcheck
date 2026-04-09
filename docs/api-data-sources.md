# yakcheck 데이터 소스 API 문서

> **Last updated**: 2026-04-08
> **API Key**: 환경변수 `DATA_GO_KR_API_KEY` (모든 API 공유)

---

## 1. DUR 병용금기 정보 (식약처)

**data.go.kr ID**: [15075057](https://www.data.go.kr/data/15075057/openapi.do) (e약은요 내 DUR 서비스)

### 엔드포인트

```
https://apis.data.go.kr/1471000/DURPrdlstInfoService03
```

### 오퍼레이션

| 오퍼레이션 | 건수 | 설명 |
|-----------|-----:|------|
| `getUsjntTabooInfoList03` | 814,592 | 병용금기 (품목×품목 조합) |
| `getEfcyDplctInfoList03` | 7,035 | 효능군중복 |
| `getCpctyAtentInfoList03` | 6,667 | 용량주의 |
| `getMdctnPdAtentInfoList03` | 612 | 투여기간주의 |
| `getPwnmTabooInfoList03` | 16,271 | 임부금기 |
| `getOdsnAtentInfoList03` | 2,011 | 노인주의 |
| `getSpcifyAgrdeTabooInfoList03` | 2,666 | 특정연령대금기 |

### 주요 파라미터

| 파라미터 | 필수 | 설명 |
|---------|:----:|------|
| `serviceKey` | O | API 인증키 |
| `numOfRows` | - | 페이지당 건수 (최대 **500**) |
| `pageNo` | - | 페이지 번호 |
| `typeName` | - | `성분` 또는 `품목` (성분 수준/품목 수준 데이터) |

> **주의**: `itemName`, `ingrName`, `ingrEngName` 등 필터 파라미터가 문서에 있으나, 실제로는 **필터링이 작동하지 않음** (항상 전체 데이터 반환).

### 응답 필드 (품목 수준, `getUsjntTabooInfoList03`)

**Side A (약품)**:

| 필드 | 설명 | 예시 |
|------|------|------|
| `ITEM_SEQ` | 품목기준코드 | `200000913` |
| `ITEM_NAME` | 품목명 | `코니트라캡슐(이트라코나졸)` |
| `INGR_CODE` | DUR 성분코드 | `D000762` |
| `INGR_KOR_NAME` | 성분 한글명 | `이트라코나졸` |
| `INGR_ENG_NAME` | 성분 영문명 | `Itraconazole` |
| `MAIN_INGR` | 주성분 (M코드 포함) | `[M083734]이트라코나졸` |
| `ETC_OTC_NAME` | 전문/일반 구분 | `전문의약품` |
| `CLASS_NAME` | 약효분류 | `기타의 화학요법제` |
| `ENTP_NAME` | 업체명 | `코오롱제약(주)` |

**Side B (상대 약품)**: `MIXTURE_` prefix 동일 구조

**공통**:

| 필드 | 설명 |
|------|------|
| `DUR_SEQ` | DUR 고유번호 |
| `PROHBT_CONTENT` | 금기 사유 |
| `NOTIFICATION_DATE` | 고시일자 |

### yakcheck 활용

- **drugs 테이블 구축**: 품목 데이터에서 고유 ITEM_SEQ 추출 → 전문의약품 포함
- **contraindications 테이블**: 성분 수준 데이터로 성분 쌍 구축
- **교차 매칭**: 약 → 성분코드(INGR_CODE) → 성분 쌍 조회

---

## 2. e약은요 (식약처)

**data.go.kr ID**: [15075057](https://www.data.go.kr/data/15075057/openapi.do)

### 엔드포인트

```
https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList
```

### 주요 파라미터

| 파라미터 | 설명 |
|---------|------|
| `itemName` | 약품명 검색 |
| `entpName` | 업체명 검색 |
| `itemSeq` | 품목기준코드 |
| `type` | `json` or `xml` |

### 응답 필드

| 필드 | 설명 |
|------|------|
| `itemSeq` | 품목기준코드 |
| `itemName` | 품목명 |
| `entpName` | 업체명 |
| `efcyQesitm` | 효능 |
| `useMethodQesitm` | 용법용량 |
| `atpnQesitm` | 주의사항 |
| `intrcQesitm` | 상호작용 |
| `seQesitm` | 부작용 |
| `depositMethodQesitm` | 보관법 |

### 제한사항

- **일반의약품 위주** ~4,700건
- 전문의약품 대부분 미수록 (도바토, 트리멕 등 없음)
- 성분코드(INGR_CODE) 필드 없음 → DUR API로 별도 매핑 필요

---

## 3. 의약품 제품 허가정보 (식약처)

**data.go.kr ID**: [15095677](https://www.data.go.kr/data/15095677/openapi.do)
**신청일**: 2026-04-08

### 엔드포인트

```
https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07
```

### 오퍼레이션

| 오퍼레이션 | 건수 | 설명 |
|-----------|-----:|------|
| `getDrugPrdtPrmsnInq07` | 43,339 | 허가 목록 (검색/필터 지원) |
| `getDrugPrdtPrmsnDtlInq06` | - | 허가 상세정보 |
| `getDrugPrdtMcpnDtlInq07` | 127,689 | 주성분 상세 (필터 미작동) |

### 주요 파라미터 (`getDrugPrdtPrmsnInq07`)

| 파라미터 | 설명 | 필터 |
|---------|------|:----:|
| `item_name` | 품목명 | O |
| `entp_name` | 업체명 | O |
| `spclty_pblc` | 전문/일반구분 | O |
| `item_ingr_name` | 주성분명 (영문) | O |
| `edi_code` | 보험코드 | O |
| `type` | `json` or `xml` | - |

### 응답 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `ITEM_SEQ` | 품목기준코드 | `202001791` |
| `ITEM_NAME` | 품목명 | `도바토정` |
| `ITEM_INGR_NAME` | 주성분 (영문) | `Dolutegravir Sodium Micronized/Lamivudine` |
| `ITEM_INGR_CNT` | 주성분 개수 | `2` |
| `SPCLTY_PBLC` | 전문/일반 | `전문의약품` |
| `PRDUCT_TYPE` | 약효분류 | `[06290]기타의 화학요법제` |
| `ENTP_NAME` | 업체명 | `(주)글락소스미스클라인` |
| `BIG_PRDT_IMG_URL` | 제품 이미지 URL | - |
| `EDI_CODE` | 보험코드 | `650003200` |
| `CANCEL_NAME` | 상태 | `정상` / `취소` |

### yakcheck 활용

- **전체 허가 약품 검색** (43K건, 전문+일반)
- `ITEM_INGR_NAME` (영문) → DUR `INGR_ENG_NAME`으로 성분코드 매핑 가능
- `SPCLTY_PBLC`로 전문/일반 구분 표시

### 주성분 상세 (`getDrugPrdtMcpnDtlInq07`)

| 필드 | 설명 |
|------|------|
| `ITEM_SEQ` | 품목기준코드 |
| `MTRAL_CODE` | 원료코드 (M코드) |
| `MTRAL_NM` | 원료명 |
| `QNT` | 함량 |
| `MAIN_INGR_ENG` | 주성분 영문명 |

> **주의**: `item_seq` 필터가 작동하지 않음. 항상 전체 127K건 반환.

---

## 4. 묶음의약품정보서비스 (식약처)

**data.go.kr ID**: [15063908](https://www.data.go.kr/data/15063908/openapi.do)
**신청일**: 2026-04-08

### 엔드포인트

```
https://apis.data.go.kr/1471000/DrbBundleInfoService02/getDrbBundleList02
```

### 데이터 규모

- **16,303건** (동일 성분 약품 그룹)

### 주요 파라미터

| 파라미터 | 설명 |
|---------|------|
| `cnsgnItemName` | 제품명 검색 |
| `trustMainingr` | 대표 주성분명 |
| `type` | `json` or `xml` |

### 응답 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `trustIndutyCode` | 대표 품목기준코드 | `198000058` |
| `trustItemName` | 대표 제품명 | `디페인정(디클로페낙나트륨)` |
| `trustMainingr` | 대표 주성분 | `디클로페낙나트륨` |
| `trustHiraMainingrCode` | 심평원 주성분코드 | `143504ATB` |
| `trustAtcCode` | ATC코드 | `M01AB05 (diclofenac)` |
| `cnsgnItemSeq` | 묶음 품목코드 | `201602311` |
| `cnsgnItemName` | 묶음 제품명 | `클로디펜정(디클로페낙나트륨)` |

### yakcheck 활용

- 동일 성분 약품 그룹핑 (제네릭 ↔ 오리지널)
- `trustHiraMainingrCode` → HIRA 코드 기반 매핑
- `trustAtcCode` → WHO ATC 분류 코드

---

## 5. HIRA 의약품성분약효정보 (건강보험심사평가원)

**data.go.kr ID**: [15021027](https://www.data.go.kr/data/15021027/openapi.do)
**신청일**: 2026-04-08

### 엔드포인트

```
https://apis.data.go.kr/B551182/msupCmpnMeftInfoService/getMajorCmpnNmCdList
```

### 데이터 규모

- **60,103건** (성분×약효 조합)

### 주요 파라미터

> **최소 1개 필수** (pageNo/numOfRows 외)

| 파라미터 | 설명 | 필터 방식 |
|---------|------|----------|
| `gnlNmCd` | 일반명코드 | 정확 매칭 |
| `gnlNm` | 일반명 (영문 성분명) | 부분 매칭 |
| `meftDivNo` | 약효분류번호 | **prefix 매칭** |
| `divNm` | 분류명 | 부분 매칭 |

### meftDivNo 분류 체계

| 대분류 | 건수 | 범위 |
|:------:|-----:|------|
| 1xx | 10,475 | 마취제, 최면진정제, 진통제, 알레르기 |
| 2xx | 13,891 | 순환기, 호흡기, 소화기 |
| 3xx | 30,853 | 비타민, 무기질, 효소, 호르몬 |
| 4xx | 1,333 | 항생물질 |
| 6xx | 2,078 | 화학요법제 (항바이러스 포함) |
| 7xx | 1,262 | 생물학적 제제 |
| 8xx | 211 | 진단용약 |

### 응답 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `gnlNmCd` | 일반명코드 (HIRA) | `628601ATB` |
| `gnlNm` | 일반명 (영문) | `dolutegravir sodium(as dolutegravir)` |
| `meftDivNo` | 약효분류번호 | `629` |
| `divNm` | 분류명 | `기타의 화학요법제` |
| `fomnTpCdNm` | 제형 | `정제,저작정` |
| `iqtyTxt` | 함량 | `50` |
| `unit` | 단위 | `mg` |
| `injcPthCdNm` | 투여경로 | `내복` |

### 응답 형식

- **XML만 지원** (`type=json` 불가)

### yakcheck 활용

- HIRA 일반명코드(gnlNmCd) ↔ 묶음의약품 trustHiraMainingrCode 매핑
- 성분별 약효분류 정보 보강
- 영문 성분명 → DUR INGR_ENG_NAME 교차 매핑 보조

---

## 6. 의약품 낱알식별 정보 (식약처)

**data.go.kr ID**: [15057639](https://www.data.go.kr/data/15057639/openapi.do)

### 엔드포인트

```
https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03
```

### 데이터 규모

- **25,423건**

### 주요 파라미터

| 파라미터 | 설명 |
|---------|------|
| `item_name` | 품목명 검색 |
| `entp_name` | 업체명 |
| `item_seq` | 품목기준코드 |
| `drug_shape` | 모양 (원형, 타원형 등) |
| `color_class1` | 색상 |
| `print_front` | 앞면 식별문자 |
| `type` | `json` or `xml` |

### 응답 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `ITEM_SEQ` | 품목기준코드 | `200808876` |
| `ITEM_NAME` | 품목명 | `가스디알정50밀리그램` |
| `ITEM_IMAGE` | 낱알 이미지 URL | `https://nedrug.mfds.go.kr/...` |
| `PRINT_FRONT` / `PRINT_BACK` | 식별문자 (앞/뒤) | `IDG` |
| `DRUG_SHAPE` | 모양 | `원형` |
| `COLOR_CLASS1` / `COLOR_CLASS2` | 색상 | `연두` |
| `LENG_LONG` / `LENG_SHORT` / `THICK` | 크기 (mm) | `7.6` |
| `CLASS_NAME` | 약효분류 | `기타의 소화기관용약` |
| `ETC_OTC_NAME` | 전문/일반 | `전문의약품` |
| `FORM_CODE_NAME` | 제형 | `당의정` |

### yakcheck 활용

- Phase 3 (OCR 약 식별) — 사진으로 약 식별 시 모양/색상/식별문자로 검색
- 약 이미지 표시 (`ITEM_IMAGE`)
- `ITEM_SEQ`로 drugs 테이블과 JOIN 가능

---

## 7. DUR 성분정보 (식약처)

**data.go.kr ID**: [15056780](https://www.data.go.kr/data/15056780/openapi.do)

### 엔드포인트

```
https://apis.data.go.kr/1471000/DURIrdntInfoService03
```

> **주의**: 서비스명은 `03`이지만 오퍼레이션명은 `02`로 끝남.

### 오퍼레이션

| 오퍼레이션 | 건수 | 설명 |
|-----------|-----:|------|
| `getUsjntTabooInfoList02` | 1,816 | 병용금기 (성분 쌍) |
| `getPwnmTabooInfoList02` | 1,433 | 임부금기 |
| `getCpctyAtentInfoList02` | 706 | 용량주의 |
| `getMdctnPdAtentInfoList02` | 98 | 투여기간주의 |
| `getOdsnAtentInfoList02` | 112 | 노인주의 |
| `getSpcifyAgrdeTabooInfoList02` | 230 | 특정연령대금기 |
| `getEfcyDplctInfoList02` | 404 | 효능군중복 |

### 응답 필드 (병용금기 `getUsjntTabooInfoList02`)

| 필드 | 설명 | 예시 |
|------|------|------|
| `INGR_CODE` | DUR 성분코드 | `D000762` |
| `INGR_ENG_NAME` | 성분 영문명 | `Itraconazole` |
| `INGR_KOR_NAME` | 성분 한글명 | `이트라코나졸` |
| `ORI` | 원료코드 목록 (M코드) | `[M083734]이트라코나졸/[M092870]...` |
| `CLASS` | 약효분류 | `[06290]기타의 화학요법제` |
| `MIXTURE_INGR_CODE` | 상대 성분코드 | `D000027` |
| `MIXTURE_INGR_ENG_NAME` | 상대 성분 영문명 | `Simvastatin` |
| `PROHBT_CONTENT` | 금기 사유 | `횡문근융해증` |
| `DEL_YN` | 상태 | `정상` |

### 품목정보 서비스와의 차이

| | 성분정보 (`DURIrdntInfoService03`) | 품목정보 (`DURPrdlstInfoService03`) |
|--|---|---|
| 단위 | **성분 쌍** (D코드 ↔ D코드) | **품목 쌍** (ITEM_SEQ ↔ ITEM_SEQ) |
| 건수 | 1,816 (병용금기) | 814,592 (병용금기) |
| `ORI` 필드 | O (M코드 전체 목록) | X |
| `ITEM_SEQ` | X | O |
| 용도 | 성분 수준 교차 검사 | 품목→성분 매핑 추출 |

### yakcheck 활용

- 기존 contraindications 테이블의 소스 (현재 1,751쌍 → 1,816쌍으로 업데이트 가능)
- `ORI` 필드: M코드 → D코드 브릿지 테이블 구축에 활용 가능
- 허가정보 MTRAL_CODE(M코드) → ORI에서 D코드 역매핑

---

## API 간 매핑 관계도

```
[허가정보 43K]
  ITEM_SEQ ──────────── ITEM_INGR_NAME (영문 성분명)
       │                      │
       │                      ▼ (영문명 매칭)
       │              [DUR 병용금기]
       │                INGR_CODE (D코드) ← 교차 검사 핵심
       │                INGR_ENG_NAME
       │                MAIN_INGR → [M코드]
       │                      │
       ▼                      ▼
[묶음의약품 16K]          [HIRA 60K]
  trustHiraMainingrCode ── gnlNmCd (HIRA 코드)
  cnsgnItemSeq             gnlNm (영문 성분명)
  trustAtcCode             meftDivNo (약효분류)
```

### 매핑 체인

1. **허가정보 → DUR**: `ITEM_INGR_NAME` ↔ `INGR_ENG_NAME` (영문명 매칭)
2. **묶음의약품 → HIRA**: `trustHiraMainingrCode` ↔ `gnlNmCd` (코드 매칭)
3. **DUR 내부**: `MAIN_INGR` [M코드] → `INGR_CODE` [D코드]

---

## 일일 API 호출 제한

| API | 제한 |
|-----|------|
| 개발 계정 (data.go.kr) | **10,000회/일** (API당) |

---

## 현재 사용 현황

| API | 용도 | 상태 |
|-----|------|------|
| DUR 병용금기 (성분) | 성분 쌍 contraindications 테이블 | 적재 완료 (1,751 쌍) |
| DUR 병용금기 (품목) | drugs 테이블 확장 (전문의약품) | 수집 진행 중 |
| e약은요 | 기본 drugs 테이블 | 적재 완료 (4,696건) |
| 허가정보 | 검색 확장 (43K 전체 약품) | 신청 완료, 연동 예정 |
| 묶음의약품 | 동일 성분 그룹핑 | 신청 완료, 연동 예정 |
| HIRA 성분약효 | 성분 분류 보강 | 신청 완료, 연동 예정 |
