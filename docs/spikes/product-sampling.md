# Product Sampling Plan

## Hypothesis

Oh My Feed의 차별 가치는 AI 뉴스 요약이 아니라, 사용자가 오늘 볼 정보를 줄이고 프로젝트 관련성을 판단한 뒤 승인된 지식을 자신의 AI가 활용하게 하는 연결 루프에 있다.

## Sampling questions

1. `247 → 7` 메시지가 문제와 가치를 즉시 전달하는가?
2. 사용자는 relevance score보다 이유와 영향 설명을 신뢰하는가?
3. `저장`, `프로젝트 연결`, `AI에게 학습`이 서로 구분되는가?
4. human/agent 상태 분리가 설명 없이도 이해되는가?
5. 승인된 지식이 이후 질문에 쓰이는 장면이 누적 가치를 보여주는가?

## Scope

- 1 persona: Cowork 2.2 전환을 준비하는 개발자
- 1 project: Cowork 2.2
- 6 feed items, Today 3 items
- 1 high-relevance item의 상세 설명
- 원문 열기, 저장, 프로젝트 연결, 숨김
- 1 agent knowledge suggestion의 accept/reject
- human/agent 상태를 함께 표시
- 승인 지식을 사용하는 1개의 고정 Q&A

## Non-goals

실제 운영 수집, production LLM 품질, 자동 개인화, 인증, 협업, 모바일, 결제, 전용 vector DB, 완전한 MCP server, 배포 운영은 검증하지 않는다.

## Vertical slice

```text
mock source collection
  → Today selection
  → item detail + original link
  → save or hide
  → project relevance explanation
  → project link
  → agent knowledge suggestion
  → human accept/reject
  → approved knowledge used in one answer
```

이 흐름 외의 화면과 데이터는 만들지 않는다.

## Mock strategy

`mock/demo-data.json`을 유일한 fixture로 사용한다.

- 관련도 높은 항목 1개: Spring Boot 4.1
- 관련도 중간 항목 2개: Elasticsearch, MCP authorization
- 낮은 항목 3개: 프로젝트와 무관한 AI/프런트엔드 소식
- agent가 먼저 검토했지만 사람이 읽지 않은 항목 포함
- pending suggestion 1개와 승인 후 knowledge 결과 1개 포함

시간, score, 설명은 고정해 데모를 재현 가능하게 한다. 실제 RSS/LLM adapter는 같은 출력 계약을 구현하도록 후속 브랜치에서 교체한다.

## Suggested UI structure

```text
app/
  today/                 # 247 → 7, feed cards
  items/[id]/            # source, why, actions
  knowledge/             # accepted knowledge and ask demo
components/
  FeedCard
  ActorStateBadge
  ProjectRelevancePanel
  ItemActions
  SuggestionDecision
domain/
  feed
  state
  project
  suggestion
adapters/
  mock
  rss        # later
  ai         # later
  mcp        # later
```

구조는 구현 시 프레임워크 관례에 맞춰 조정하되 domain state가 UI와 provider에 종속되지 않게 한다.

## Validation script

5명의 대상 사용자에게 별도 제품 설명 없이 3분 데모를 보여준다.

1. 첫 화면을 10초 보여주고 제품이 하는 일을 묻는다.
2. Spring Boot 항목을 처리하게 하고 행동 이유를 말하게 한다.
3. 저장과 학습의 차이를 묻는다.
4. agent가 reviewed, 사람은 unread인 항목의 상태를 묻는다.
5. 마지막 Q&A가 어디에서 근거를 가져왔는지 찾게 한다.

관찰 결과는 성공 기준, 혼동 지점, 필요한 문구 변경만 기록한다. 샘플 규모에서 추천 정확도나 retention을 주장하지 않는다.

## Go / No-Go

### Go

- 5명 중 4명 이상이 제품을 프로젝트/AI 연결 도구로 설명한다.
- 5명 중 4명 이상이 저장과 승인 학습을 구분한다.
- 상태 분리를 모두 올바르게 해석한다.
- 90초 내 핵심 처리 흐름을 완료한다.

### Iterate

- 제품 개념은 이해하지만 action 이름 또는 화면 순서에서 2명 이상이 막힌다.
- 관련성 숫자는 보지만 근거를 확인하지 않는다.

### No-Go / Reframe

- 다수가 일반 AI 뉴스 요약기로만 이해한다.
- 승인 단계가 불필요하다고 느끼거나, 지식 활용 장면이 가치를 추가하지 못한다.
- 프로젝트 맥락 입력 비용이 얻는 가치보다 크다고 답한다.

## Open questions

| 질문 | 성격 | 해소 시점 |
|---|---|---|
| 원티드 제출물의 개인/회사 자산 및 아이디어 권리 경계가 명확한가? | blocking, legal/ownership | 외부 제출 전 |
| `Learn`의 가장 쉬운 한국어 표현은 무엇인가? | non-blocking, UX | 사용자 샘플 후 |
| 프로젝트 맥락을 수동 입력할지 repo에서 가져올지? | non-blocking, product | ingestion 다음 |
| 승인 지식의 수정/폐기 UX가 P0인가? | non-blocking, trust | knowledge 구현 전 |
| agent 연동이 REST 데모로 충분한가, MCP가 심사 전달력에 필요한가? | non-blocking, demo | vertical slice 검토 후 |
| relevance 품질의 최소 기준과 평가셋은 무엇인가? | blocking for real AI | LLM 구현 전 |

## Definition of done

- 이 문서와 제품/아키텍처/ADR가 서로 모순되지 않는다.
- fixture가 6개 항목, 분리된 actor 상태, project relevance, pending suggestion을 포함한다.
- mock에서 `accept → approved knowledge`, `reject → no knowledge` 전이가 재현 가능하다.
- 3분 데모 대본과 fallback이 준비된다.
- 다음 구현 브랜치의 범위를 합의할 수 있다.

## Recommended next branches

1. `feat/demo-vertical-slice`: fixture 기반 Today→approval UI와 상태 전이 테스트
2. `feat/feed-ingestion`: RSS/Atom 수집, 정규화, 중복 제거
3. `feat/project-relevance`: 실제 AI provider, provenance, 평가 fixture
4. `feat/approved-knowledge`: 승인 지식 저장·검색과 폐기 정책
5. `feat/agent-interface`: REST 안정화 후 필요한 경우 MCP adapter
