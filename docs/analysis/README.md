# Monorepo Component Analysis Dashboard

This directory contains detailed analysis documents for each component of the Clubfinder monorepo, with prioritized improvement checklists to track progress.

## Component Status Overview

| Component | Priority | Critical Issues | Tech Debt Items | Test Coverage | Status |
|-----------|----------|-----------------|-----------------|---------------|--------|
| [app_clubfindr](./app_clubfindr-analysis.md) | **HIGH** | 3 | 12 | ~0% | Needs Immediate Attention |
| [spotify_service](./spotify_service-analysis.md) | **HIGH** | 4 | 8 | 0% | Needs Immediate Attention |
| [data_collection](./data_collection-analysis.md) | **HIGH** | 4 | 10 | 0% | Core System - Needs Hardening |
| [clubfindr](./clubfindr-analysis.md) | MEDIUM | 2 | 10 | ~5% | Maintenance Required |
| [barfindr](./barfindr-analysis.md) | LOWER | 1 | 6 | Limited | Stable but Incomplete |

## Priority Definitions

- **HIGH**: Security vulnerabilities, crashes, or blockers that affect production
- **MEDIUM**: Technical debt and code quality issues that slow development
- **LOWER**: Improvements that would be nice to have but aren't blocking

## Quick Stats

### Critical Issues by Category

| Category | app_clubfindr | spotify_service | data_collection | clubfindr | barfindr |
|----------|---------------|-----------------|-----------------|-----------|----------|
| Security | 0 | 2 | 2 | 2 | 1 |
| Stability | 2 | 1 | 1 | 0 | 0 |
| Architecture | 1 | 1 | 1 | 0 | 0 |

### Technical Debt Summary

| Issue Type | Total Count |
|------------|-------------|
| Missing Tests | 4 components |
| Console.log Statements | 940+ |
| TypeScript `any` Usage | 144+ |
| Bare Except Clauses | 22+ |
| Hardcoded Credentials | 5+ locations |

## Recommended Action Order

### Phase 1: Security & Stability (Immediate)
1. Fix Spotify OAuth crash in app_clubfindr (Android)
2. Remove shell injection vulnerabilities in spotify_service
3. Secure plaintext credentials in spotify_service
4. Re-enable CSRF protection in clubfindr
5. Replace pickle files with JSON in data_collection (security)
6. Implement atomic file locking in data_collection (stability)

### Phase 2: Code Quality (Short-term)
1. Replace bare `except:` with specific exceptions in spotify_service
2. Add basic test coverage to app_clubfindr and data_collection
3. Remove excessive console.log statements across all components
4. Fix TypeScript `any` usage in app_clubfindr
5. Consolidate duplicate functions in data_collection/utils.py

### Phase 3: Architecture (Medium-term)
1. Implement proper error boundaries in app_clubfindr
2. Add comprehensive test suites to all components
3. Refactor large components in app_clubfindr
4. Complete API routes in barfindr
5. Add database connection pooling to data_collection
6. Implement checkpointing for data_collection runs

## How to Use These Documents

Each analysis document follows a consistent structure:

1. **Component Overview** - Purpose, tech stack, current state
2. **Architecture** - File structure, key patterns
3. **Critical Issues** - Security, crashes, blockers (fix first)
4. **Technical Debt** - Code quality, testing gaps
5. **Improvement Checklist** - Prioritized tasks with checkboxes
6. **Verification Steps** - How to test fixes

### Tracking Progress

Use the checkboxes in each document to track improvements:
- `[ ]` - Not started
- `[x]` - Completed

Update this dashboard's status table as components improve.

## Cross-Component Dependencies

```
                    ┌─────────────────────────────────────┐
                    │         data_collection             │
                    │   (Populates all event/artist data) │
                    └─────────────────┬───────────────────┘
                                      │ writes to
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      PostgreSQL (clubfindr schema)  │
                    └─────────────────┬───────────────────┘
                                      │ read by
                    ┌─────────────────┴───────────────────┐
                    │                                     │
                    ▼                                     ▼
        ┌───────────────────┐               ┌───────────────────┐
        │     clubfindr     │               │     barfindr      │
        │   (Web API/UI)    │◄──────────────│ (Venue Backend)   │
        └─────────┬─────────┘               └───────────────────┘
                  │
                  │ API calls
                  ▼
        ┌───────────────────┐
        │   app_clubfindr   │
        │   (Mobile App)    │
        └─────────┬─────────┘
                  │
                  │ OAuth tokens
                  ▼
        ┌───────────────────┐
        │  spotify_service  │
        │ (Spotify App Mgmt)│
        └───────────────────┘
```

**Data Flow**: data_collection → Database → clubfindr/barfindr → app_clubfindr

## Last Updated

- **Date**: 2026-01-18
- **Author**: Analysis generated via codebase review
