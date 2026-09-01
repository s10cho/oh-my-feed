# Oh My Feed

> 중요한 정보를 읽는 데서 끝내지 않고, 내 프로젝트와 AI에 연결하는 개인 정보 피드.

이 저장소는 원티드 이벤트용 제품 방향을 검증하는 최소 MVP입니다. 실제 RSS와 LLM 대신 고정 샘플 데이터를 사용해 핵심 사용자 흐름을 끝까지 실행합니다.

1. 많은 새 항목 중 오늘 볼 것만 줄여 주는 경험이 즉시 이해되는가?
2. 일반 요약보다 “왜 내 프로젝트에 중요한가”가 더 큰 가치를 주는가?
3. 사람이 승인한 정보만 AI의 지식으로 넘기는 흐름이 신뢰를 만드는가?
4. 사람과 에이전트의 처리 상태를 나누는 모델이 실제 사용에 필요한가?

현재 브랜치의 범위와 검증 방법은 [제품 샘플링 계획](docs/spikes/product-sampling.md)에 정리되어 있습니다.

## 문서 안내

- [제품 비전](docs/product/product-vision.md)
- [최소 MVP 정의와 달성 근거](docs/product/minimum-mvp.md)
- [문제와 요구사항](docs/product/problem-definition.md)
- [원티드 데모 시나리오](docs/product/wanted-demo-scenario.md)
- [저장소 기준선](docs/architecture/repository-baseline.md)
- [시스템 경계와 컴포넌트](docs/architecture/system-context.md)
- [도메인과 상태 모델](docs/architecture/domain-model.md)
- [API 경계](docs/architecture/api-boundary.md)
- [ADR-0001: 사람과 에이전트 상태 분리](docs/adr/0001-separate-human-agent-state.md)
- [ADR-0002: 프로젝트 중심 피드](docs/adr/0002-project-aware-feed.md)

## 실행

Node.js와 Python 3 외의 패키지는 필요하지 않습니다.

```bash
npm test
npm start
```

브라우저에서 `http://localhost:4173`을 열고 다음 흐름을 확인합니다.

1. MCP authorization 항목 선택
2. 프로젝트 관련 근거 확인
3. 프로젝트 연결 및 `AI 지식으로 승인`
4. 하단에서 “최근 Orbit 설계에 반영할 변화가 있어?” 질문

실제 RSS 수집, 인증, LLM 연동, 벡터 검색, 배포는 아직 구현하지 않습니다. 샘플 데이터 6개로 하나의 vertical slice를 검증하고, go/no-go 기준을 통과한 뒤 기능별 구현 브랜치로 나눕니다.
