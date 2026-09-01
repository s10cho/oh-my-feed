# ADR-0001: 사람과 에이전트의 항목 상태를 분리한다

**Status:** Accepted for sampling  
**Date:** 2026-09-01  
**Deciders:** 샘플 구현 담당자, 제품 검토자

## Context

사람과 agent가 같은 피드를 처리하지만 `agent가 검토함`과 `사람이 읽음`은 다른 사실이다. 하나의 상태를 공유하면 agent의 자동 작업이 사용자의 inbox를 임의로 정리하고, 누가 어떤 판단을 했는지 설명할 수 없게 된다.

## Decision

FeedItem은 공유하되 `HumanItemState`와 `AgentItemState`를 별도 레코드와 별도 명령 경계로 관리한다. Agent suggestion 또한 human decision 전까지 프로젝트 연결이나 승인 지식을 만들지 못한다.

## Options Considered

| 선택지 | 복잡도 | 신뢰/감사 가능성 | 판단 |
|---|---:|---:|---|
| 단일 처리 상태 공유 | 낮음 | 낮음 | 기각 |
| actor별 event log만 저장 | 높음 | 높음 | 향후 고려 |
| 사람/agent projection 분리 | 중간 | 높음 | 채택 |

## Consequences

- 사람의 inbox와 agent 자동화가 서로 덮어쓰지 않는다.
- UI와 API가 actor를 명시해야 하므로 필드와 테스트가 늘어난다.
- 장기적으로 여러 agent를 지원할 수 있다.
- 사용자가 숨겨도 agent audit 기록을 보존하는 정책이 필요하다.

## Action Items

1. 상태 전이 테스트에서 교차 변경 금지를 검증한다.
2. human endpoint와 agent endpoint의 권한을 분리한다.
3. UI에서 두 상태를 혼동하지 않는 표현을 사용자 테스트한다.
