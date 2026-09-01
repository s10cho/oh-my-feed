# ADR-0002: 일반 요약보다 프로젝트 관련성을 핵심 AI 경험으로 둔다

**Status:** Accepted for sampling  
**Date:** 2026-09-01  
**Deciders:** 샘플 구현 담당자, 제품 검토자

## Context

RSS 수집과 일반 요약만으로는 기존 reader 제품과 구분하기 어렵다. 사용자가 반복해서 수행하는 어려운 판단은 “이 글이 내 현재 프로젝트에 영향을 주는가”다. 원티드 데모에서도 AI가 제품 구조의 핵심임을 짧게 보여줄 필요가 있다.

## Decision

샘플의 AI 기능을 `project relevance + why it matters + knowledge suggestion`으로 제한한다. 관련도 숫자만 보여주지 않고 프로젝트 목표와 기술에 근거한 이유를 함께 제공한다. 제안은 사람의 승인 전까지 지식이 아니다.

## Options Considered

| 선택지 | 데모 차별성 | 구현 위험 | 판단 |
|---|---:|---:|---|
| 일반 AI 요약 | 낮음 | 낮음 | 기각 |
| 전자동 개인 랭킹 | 중간 | 높음 | 보류 |
| 프로젝트 관련성 설명 | 높음 | 중간 | 채택 |
| 범용 RAG 대화 | 중간 | 높음 | 후속 |

## Consequences

- 최소한의 Project context 모델이 P0가 된다.
- relevance의 품질과 근거 표현을 검증해야 한다.
- 랭킹 전체를 LLM에 맡길 필요가 없다.
- 데모에서는 mock score를 모델 성능 결과처럼 주장하지 않는다.

## Action Items

1. 프로젝트 1개와 관련/비관련 항목을 포함한 fixture를 만든다.
2. 이유, 예상 영향, 제안 행동의 출력 형식을 고정한다.
3. 실제 LLM 도입 전 deterministic mock으로 UX 가설을 먼저 검증한다.
