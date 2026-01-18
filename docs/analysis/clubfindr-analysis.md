# clubfindr Analysis

**Priority: MEDIUM**
**Last Updated: 2026-01-17**

## Component Overview

### Purpose
Main SvelteKit web application for discovering music events and connecting artists with venues. Serves as the primary user interface and API backend for the Clubfinder platform.

### Tech Stack
- **Framework**: SvelteKit
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (via pg Pool)
- **Build**: Vite
- **Adapter**: @sveltejs/adapter-node

### Current State
The application is functional and deployed but has security concerns (disabled CSRF), limited test coverage (~5%), and accumulated technical debt in the form of excessive logging and hardcoded values.

## Architecture

### File Structure
```
clubfindr/
├── src/
│   ├── routes/              # SvelteKit file-based routing
│   │   ├── api/            # REST API endpoints
│   │   │   ├── artists/
│   │   │   ├── bars/
│   │   │   ├── mobile/
│   │   │   ├── spotify/
│   │   │   ├── soundcloud/
│   │   │   └── venues/
│   │   ├── (auth)/         # Authenticated routes
│   │   └── (public)/       # Public routes
│   ├── lib/
│   │   ├── data/           # Genre classification system
│   │   ├── types/          # TypeScript definitions
│   │   ├── db.ts           # Database connection
│   │   ├── authUtils.ts    # Authentication utilities
│   │   └── cookieManager.ts # Session management
│   └── hooks.server.ts     # Server hooks (auth, rate limiting)
├── static/                  # Static assets
├── tests/                   # Playwright tests
├── scripts/                 # Build and maintenance scripts
└── svelte.config.js        # SvelteKit configuration
```

### Key Patterns
- File-based routing with +page.svelte, +page.server.ts, +layout.svelte
- Server-side rendering with client hydration
- Cookie-based session authentication
- Direct PostgreSQL queries via pg Pool
- Rate limiting in server hooks (60 req/min per IP)

### API Structure
```
/api/
├── artists/
│   ├── [id]/              # Artist details
│   └── search/            # Artist search
├── bars/
│   └── [id]/              # Bar/venue details
├── events/
│   ├── [city]/            # Events by city
│   └── search/            # Event search
├── mobile/                 # Mobile app endpoints
├── spotify/               # Spotify integration
├── soundcloud/            # SoundCloud integration
└── venues/                # Venue management
```

## Critical Issues

### 1. CSRF Protection Disabled
**Severity**: Critical
**Location**: `svelte.config.js:21`

```javascript
csrf: {
  checkOrigin: false  // DANGEROUS
}
```

**Impact**: Application is vulnerable to Cross-Site Request Forgery attacks. Malicious sites could make authenticated requests on behalf of users.

**Recommended Fix**:
```javascript
csrf: {
  checkOrigin: true
}
```

Then update any legitimate cross-origin requests to use proper CSRF tokens.

### 2. SSL Verification Disabled in Email
**Severity**: High
**Location**: `src/lib/email.ts`

SSL certificate verification is disabled for email connections:

```typescript
// Problematic
rejectUnauthorized: false
```

**Impact**: Man-in-the-middle attacks possible on email communications.

**Recommended Fix**:
- Enable SSL verification
- Use proper certificates
- If using self-signed certs, add them to trust store

## Technical Debt

### 1. Excessive Console.log Statements
**Count**: 439+ statements
**Locations**: Throughout all files

**Files with Most Logs**:
| File | Count |
|------|-------|
| `src/routes/api/spotify/+server.ts` | 35+ |
| `src/lib/db.ts` | 25+ |
| `src/routes/api/artists/+server.ts` | 20+ |

**Impact**:
- Performance overhead
- Potential PII leakage
- Log noise in production

### 2. Limited Test Coverage
**Estimated Coverage**: ~5%
**Current Tests**:
- E2E: Playwright (partial coverage)
- Unit: Vitest (minimal)

**Critical Untested Paths**:
- Authentication flow
- API endpoint validation
- Genre classification
- Session management

### 3. Hardcoded URLs and Credentials
**Locations**:
- `src/lib/constants.ts` - API URLs
- `src/lib/email.ts` - SMTP settings
- Various route files

**Examples**:
```typescript
const API_URL = "https://api.clubfindr.com"  // Hardcoded
```

### 4. Missing Input Validation
**Location**: Multiple API routes
**Issue**: Some endpoints don't fully validate input parameters

```typescript
// Missing validation
const { email } = await request.json();
// Should validate email format, length, etc.
```

### 5. Large Server Files
**Threshold**: 300+ LOC for server files

| File | Lines |
|------|-------|
| `src/hooks.server.ts` | 400+ |
| `src/routes/api/spotify/+server.ts` | 350+ |

### 6. Inconsistent Error Handling
**Issue**: Mix of error handling patterns across API routes

Some routes return proper error responses, others throw unhandled exceptions.

### 7. Genre System Complexity
**Location**: `src/lib/data/`
**Issue**: Complex genre classification with multiple JSON files and processing scripts

Files involved:
- `processed_genres.json`
- `genreClusters.json`
- `unified-genres.json`
- `genre-classifier.ts`

The system works but is difficult to maintain and test.

### 8. Database Query Patterns
**Location**: `src/lib/db.ts`, route files
**Issue**: Some queries are built with string concatenation instead of parameterized queries

```typescript
// AVOID
`SELECT * FROM users WHERE name = '${name}'`

// CORRECT (already used in most places)
`SELECT * FROM users WHERE name = $1`, [name]
```

### 9. Session Management Complexity
**Location**: `src/hooks.server.ts`
**Components**:
- In-memory session cache (5-min TTL)
- Database session storage
- Cookie management
- Rate limiting

While functional, the complexity makes it hard to test and debug.

### 10. Missing API Documentation
**Issue**: No OpenAPI/Swagger documentation for API endpoints

## Improvement Checklist

### Critical (Fix Immediately)
- [ ] Re-enable CSRF protection (`checkOrigin: true`)
- [ ] Update legitimate cross-origin requests with CSRF tokens
- [ ] Enable SSL verification in email module
- [ ] Audit and fix any SQL injection vulnerabilities

### High Priority (This Sprint)
- [ ] Remove or gate console.log statements for production
- [ ] Add unit tests for authentication flow
- [ ] Add API endpoint validation tests
- [ ] Move hardcoded URLs to environment variables
- [ ] Add input validation to all API endpoints

### Medium Priority (Next Sprint)
- [ ] Add comprehensive E2E test coverage
- [ ] Standardize error handling across API routes
- [ ] Refactor large server files into smaller modules
- [ ] Add API documentation (OpenAPI/Swagger)
- [ ] Simplify genre classification system

### Lower Priority (Backlog)
- [ ] Add request/response logging middleware
- [ ] Implement API versioning
- [ ] Add performance monitoring
- [ ] Create database migration testing
- [ ] Add accessibility (a11y) testing

## Verification Steps

### Testing CSRF Re-enablement
```bash
# 1. Update svelte.config.js
# checkOrigin: true

# 2. Build and test
cd clubfindr
pnpm build
pnpm preview

# 3. Verify CSRF protection
# Make cross-origin POST request without token
curl -X POST http://localhost:3000/api/some-endpoint \
  -H "Origin: http://malicious-site.com" \
  -d '{"data": "test"}'

# Should return 403 Forbidden
```

### Running Test Suite
```bash
cd clubfindr

# Unit tests
pnpm test:unit

# E2E tests
pnpm test

# With coverage
pnpm test:unit -- --coverage

# Target: >50% statement coverage
```

### Auditing Console.log
```bash
# Count current logs
grep -r "console\." --include="*.ts" --include="*.svelte" src/ | wc -l

# Create production logger utility
# src/lib/logger.ts
# Only log in development mode
```

### Checking SQL Injection
```bash
# Search for string concatenation in queries
grep -r "SELECT.*\${" --include="*.ts" src/
grep -r "INSERT.*\${" --include="*.ts" src/
grep -r "UPDATE.*\${" --include="*.ts" src/
grep -r "DELETE.*\${" --include="*.ts" src/

# All queries should use parameterized format: $1, $2, etc.
```

## Environment Variables Required

```bash
# Database
VITE_PG_USERNAME=
VITE_PG_PASSWORD=
VITE_PG_DB=
VITE_PG_HOST=
VITE_PG_PORT=

# Spotify
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_CLIENT_SECRET=

# SoundCloud
VITE_SOUNDCLOUD_CLIENT_ID=

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=

# Email
VITE_SMTP_HOST=
VITE_SMTP_PORT=
VITE_SMTP_USER=
VITE_SMTP_PASS=
```

## Related Components

- **app_clubfindr**: Mobile app consuming this API
- **barfindr**: Venue management backend (called from some routes)
- **spotify_service**: Provides Spotify app credentials
- **data_collection**: Populates database with events

## Security Checklist

- [ ] CSRF protection enabled
- [ ] All SQL queries parameterized
- [ ] Input validation on all endpoints
- [ ] SSL verification enabled
- [ ] Rate limiting active (currently: 60/min)
- [ ] Session timeout enforced (currently: 7 days)
- [ ] Blocked paths for exploit attempts (/.env, /admin, etc.)

## Notes

The clubfindr web application is the most mature component in the monorepo but has accumulated technical debt. The CSRF issue is the most urgent concern, followed by improving test coverage to prevent regressions. The codebase is generally well-structured and follows SvelteKit conventions.
