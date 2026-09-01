# API 경계 초안

이 문서는 프레임워크가 아닌 행위 계약을 정의한다. 샘플에서는 동일 계약을 로컬 함수나 mock handler로 구현해도 된다.

## Human API

### Today 조회

`GET /api/today?date=2026-09-01`

반환: 항목, human state, agent state 요약, 프로젝트 관련성 요약. 숨김 항목은 기본 제외한다.

### 원문 처리

- `POST /api/items/{itemId}/opened`
- `PUT /api/items/{itemId}/saved` body: `{ "saved": true }`
- `PUT /api/items/{itemId}/visibility` body: `{ "visibility": "hidden" }`

명령은 human state만 변경한다.

### 프로젝트 연결 결정

`PUT /api/items/{itemId}/projects/{projectId}`

```json
{ "decision": "confirmed" }
```

### Agent 제안 결정

`POST /api/suggestions/{suggestionId}/decision`

```json
{ "decision": "accepted" }
```

accept는 idempotency key를 받고, 성공 시 KnowledgeRecord를 한 번만 생성한다. reject는 지식을 생성하지 않는다.

## Agent API

- `GET /api/agent/feed?projectId={projectId}`
- `POST /api/agent/items/{itemId}/reviewed`
- `POST /api/agent/suggestions`
- `GET /api/agent/knowledge?projectId={projectId}`

Agent credential은 human 상태 변경 endpoint를 호출할 권한이 없다. 초기 샘플에서는 인증을 구현하지 않더라도 이 경계를 handler와 테스트에서 분리한다.

## 응답에 포함할 provenance

AI 관련 응답은 최소한 아래 필드를 포함한다.

```json
{
  "sourceItemId": "item-spring-boot-41",
  "sourceUrl": "https://example.com/spring-boot-4-1",
  "generatedBy": "mock-relevance-v1",
  "generatedAt": "2026-09-01T00:00:00Z",
  "confidence": 0.92
}
```

## 오류 계약

- 존재하지 않는 항목/프로젝트: `404`
- 이미 결정된 suggestion에 다른 결정 시도: `409`
- agent가 human state 변경 시도: `403`
- provenance 없는 knowledge 생성: `422`
- 외부 AI 실패: 기존 항목은 표시하되 relevance를 `unavailable`로 반환한다.

## MCP에 대한 결정

REST 계약을 먼저 안정화한다. MCP는 후속 adapter로 제공하며 도구 후보는 다음 세 개로 제한한다.

- `oh_my_feed.get_daily_feed`
- `oh_my_feed.search_approved_knowledge`
- `oh_my_feed.mark_agent_reviewed`

MCP가 human 승인 명령을 대신 수행하지 않도록 한다.
