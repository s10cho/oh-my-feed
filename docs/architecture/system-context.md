# 시스템 경계와 컴포넌트

## 샘플 시스템 경계

```text
Official sources / Mock fixtures
              │
              ▼
       Collector + Normalizer
              │
              ▼
          Feed Store
              │
       Daily Selection Rule
              │
              ▼
        Web / API boundary
          │          │
        Human      Agent adapter
          │          │
          └────┬─────┘
               ▼
        Suggestion service
               │
          Human approval
               │
               ▼
        Approved knowledge
```

## 최소 컴포넌트

| 컴포넌트 | 책임 | 샘플 구현 |
|---|---|---|
| Source catalog | 허용된 소스와 품질 정보 | fixture |
| Collector/Normalizer | 항목을 공통 형식으로 변환, canonical URL로 중복 제거 | fixture loader |
| Feed store | 원문 메타데이터와 상태 저장 | in-memory 또는 JSON |
| Daily selector | freshness, source quality, project relevance로 후보 선택 | 고정 점수 |
| Project context | 목표, 기술, 관심사를 제공 | 프로젝트 1개 fixture |
| Relevance evaluator | 관련도, 이유, 영향, 제안 행동 생성 | 사전 생성 응답 |
| Human interaction | 원문, 저장, 연결, 숨김, 승인/거절 | UI 또는 API scaffold |
| Agent adapter | agent 검토/조회 상태를 별도로 기록 | mock endpoint |
| Knowledge ledger | 승인된 지식과 provenance 저장 | in-memory 또는 JSON |

## 권한 경계

- Collector는 원문 메타데이터를 생성할 수 있지만 사용자 상태를 변경하지 못한다.
- Agent는 자신의 review 상태와 suggestion을 만들 수 있지만 human state를 변경하지 못한다.
- 승인된 knowledge 생성은 human decision을 반드시 요구한다.
- 숨김은 사용자 표현 상태이며 원문이나 agent audit 기록을 삭제하지 않는다.
- 모든 AI 결과는 source item, model/prompt version 또는 mock fixture version을 추적한다.

## 구현 순서

1. mock fixture + 순수 도메인 전이
2. Today/Detail/Approval UI vertical slice
3. API와 영속화
4. 실제 RSS ingestion
5. 실제 relevance provider
6. 승인 지식 검색과 agent 연결

이 순서는 수집기나 LLM 연동이 제품 가설 검증을 막지 않게 한다.
