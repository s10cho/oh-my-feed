# 도메인과 상태 모델

## 최소 데이터 모델

### FeedSource

- `id`, `name`, `feedUrl`, `siteUrl`
- `kind`: `rss | atom | github_release`
- `qualityWeight`, `enabled`

### FeedItem

- `id`, `sourceId`, `canonicalUrl`
- `title`, `excerpt`, `publishedAt`, `collectedAt`
- `fingerprint`: 중복 판별용

### HumanItemState

- `userId`, `feedItemId`
- `readState`: `unread | read`
- `saved`: boolean
- `visibility`: `visible | hidden`
- `updatedAt`

### AgentItemState

- `agentId`, `feedItemId`
- `reviewState`: `unseen | reviewed`
- `reviewedAt`, `reviewVersion`

### Project

- `id`, `name`, `summary`
- `goals[]`, `technologies[]`, `constraints[]`

### ProjectItemLink

- `projectId`, `feedItemId`
- `status`: `suggested | confirmed | rejected`
- `relevanceScore`, `reasons[]`, `impact[]`
- `decidedBy`, `decidedAt`

### AgentSuggestion

- `id`, `agentId`, `feedItemId`, `projectId?`
- `kind`: `link_project | learn_knowledge | investigate`
- `payload`, `evidence[]`, `confidence`
- `status`: `pending | accepted | rejected | expired`
- `decidedBy`, `decidedAt`

### KnowledgeRecord

- `id`, `projectId?`, `sourceItemId`, `suggestionId`
- `statement`, `topics[]`, `confidence`
- `approval`: `human_approved`
- `createdAt`, `supersedesId?`

## 핵심 불변조건

1. `AgentItemState.reviewState = reviewed`는 `HumanItemState.readState`를 바꾸지 않는다.
2. `HumanItemState.visibility = hidden`은 FeedItem과 AgentItemState를 삭제하지 않는다.
3. `KnowledgeRecord`는 `accepted` 상태의 AgentSuggestion 없이는 생성할 수 없다.
4. ProjectItemLink의 `suggested`와 `confirmed`를 같은 상태로 취급하지 않는다.
5. 관련도와 confidence는 사실이 아니라 판단 보조 메타데이터다.
6. 모든 KnowledgeRecord는 하나 이상의 원문 FeedItem으로 역추적할 수 있다.

## 상태 전이

```text
Human read:       unread ──open──> read
Human saved:      false  ──save──> true ──unsave──> false
Human visibility: visible ──hide──> hidden ──restore──> visible

Agent review:     unseen ──review──> reviewed

Suggestion:       pending ──accept──> accepted ──creates──> KnowledgeRecord
                     └─────reject──> rejected
                     └─────expire──> expired

Project link:     suggested ──confirm──> confirmed
                         └──reject──> rejected
```

각 축은 독립적이다. 예를 들어 항목은 `read + saved + hidden`일 수 있고, 동시에 agent가 `reviewed`했으며 프로젝트 연결 제안은 `pending`일 수 있다.
