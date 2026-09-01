# Minimum MVP

**Status:** Implemented on `spike/product-sampling`  
**Defined:** 2026-09-01

## Outcome

한 명의 개발자가 오늘 볼 기술 정보를 하나 선택하고, 현재 프로젝트와의 관련 근거를 확인한 뒤, AI가 제안한 지식을 직접 승인하고 이후 질문에서 다시 활용할 수 있다.

## One job

> 원격 MCP 인증 가이드가 개인 프로젝트 Orbit에 어떤 영향을 주는지 판단하고, 확인한 내용을 내 AI가 다음 설계 질문에서 사용하게 한다.

## Included

- 247개 새 항목에서 오늘 볼 7개를 남겼다는 가치 메시지
- 6개 fixture 중 Today 항목 3개 표시
- 사람과 Agent의 처리 상태를 별도 레일로 표시
- 항목 선택 시 사람 상태만 `unread → read` 전환
- 프로젝트 관련도, 이유, 예상 영향 표시
- 원문 열기, 저장, 프로젝트 연결, 숨김
- AI 지식 제안의 수락 또는 거절
- 수락한 지식과 출처를 사용하는 고정 Q&A
- 데모 초기화

## Excluded

- 실제 RSS/Atom 수집
- 실제 LLM 및 relevance 평가
- 사용자 로그인과 영속 저장
- 자유 형식 RAG 검색
- MCP와 외부 agent 연결
- 배포 및 운영 기능

## Acceptance evidence

| 기준 | 결과 |
|---|---|
| 사람과 Agent 상태가 독립적으로 유지된다 | domain test 통과 |
| 숨김이 Agent 기록을 삭제하지 않는다 | domain test 통과 |
| 수락한 제안만 지식 한 건을 만든다 | domain test 통과 |
| 거절한 제안은 지식을 만들지 않는다 | domain test 통과 |
| 같은 제안을 두 번 승인해도 중복 생성하지 않는다 | domain test 통과 |
| Today→연결→승인→질문 흐름이 동작한다 | 실제 브라우저 확인 |
| 데스크톱과 390px 모바일에서 사용할 수 있다 | 실제 브라우저 확인 |

## Exit condition

이 MVP는 구현 가능성을 증명했지만 제품 가설을 검증한 것은 아니다. 다음 단계는 기능 추가가 아니라 5명 내외의 대상 사용자에게 데모를 보여 주고 `docs/spikes/product-sampling.md`의 go/no-go 기준을 기록하는 것이다.
