# CLAUDE_CODE_TASKS.md

## Project: Zohn Sports Stats

## Goal: Improve stability, scalability, and overall product quality

---

# 1. CRITICAL ISSUES (Fix First)

## 1.1 Data Loading Inefficiency

### Problem

* Entire datasets are likely loaded on initial page load
* No pagination, filtering at source, or lazy loading
* Leads to slow performance as data grows

### Tasks

* Implement paginated fetching:

```js
GET /api/stats?page=1&limit=50
```

* Add client-side state management using:

  * React Query (preferred) OR SWR

* Introduce loading + error states

### Acceptance Criteria

* Initial load < 1s for UI shell
* Data loads incrementally
* No full dataset fetch on first render

---

## 1.2 Lack of Error Handling

### Problem

* UI likely breaks silently if API fails
* No fallback states

### Tasks

* Add global error boundary
* Add per-component error states:

```jsx
if (error) return <ErrorState message="Failed to load stats" />
```

* Handle:

  * Network failures
  * Empty datasets
  * Invalid responses

### Acceptance Criteria

* No blank screens on failure
* User sees meaningful feedback

---

## 1.3 Tight Coupling Between UI and Data

### Problem

* UI components directly depend on raw API shape

### Tasks

* Create data transformation layer:

/services/statsService.js

Example:

```js
export function normalizePlayer(data) {
  return {
    name: data.player_name,
    points: data.pts,
  };
}
```

### Acceptance Criteria

* UI components consume normalized data only
* Backend changes do not break UI

---

# 2. PERFORMANCE IMPROVEMENTS

## 2.1 Large List Rendering

### Problem

* Rendering large tables without virtualization

### Tasks

* Implement virtualization:

  * react-window OR react-virtual

### Acceptance Criteria

* Smooth scrolling with 1000+ rows
* No UI lag

---

## 2.2 Bundle Size Optimization

### Problem

* Likely shipping entire JS bundle upfront

### Tasks

* Enable code splitting:

```js
const StatsPage = lazy(() => import('./StatsPage'));
```

* Remove unused dependencies
* Analyze bundle (vite-bundle-visualizer)

### Acceptance Criteria

* JS bundle reduced significantly
* Faster Time to Interactive

---

## 2.3 Caching Strategy

### Problem

* Re-fetching same data repeatedly

### Tasks

* Add caching:

  * React Query cache
  * Stale-while-revalidate strategy

### Acceptance Criteria

* Reduced API calls
* Faster repeat visits

---

# 3. UX / UI IMPROVEMENTS

## 3.1 Missing Filtering & Sorting

### Problem

* Users cannot easily explore stats

### Tasks

* Add:

  * Sort by column
  * Filter by team/player/date
  * Search input

### Acceptance Criteria

* Instant filtering without reload
* Clear UI controls

---

## 3.2 No Loading States

### Problem

* Blank screen while data loads

### Tasks

* Add skeleton loaders
* Add spinners for async sections

### Acceptance Criteria

* Visual feedback during all async operations

---

## 3.3 Poor Information Hierarchy

### Problem

* Data likely displayed without prioritization

### Tasks

* Highlight key stats
* Group related metrics
* Add headings and sections

---

# 4. ARCHITECTURE REFACTOR

## 4.1 Folder Structure

Refactor into:

/src
/components
/pages
/hooks
/services
/utils
/types

---

## 4.2 Reusable Components

Create:

* Table
* StatCard
* Loader
* ErrorState

---

## 4.3 State Management

* Use React Query for server state
* Use hooks for local logic

---

# 5. ACCESSIBILITY (A11y)

### Tasks

* Use semantic tables
* Add aria-labels
* Ensure keyboard navigation
* Add focus states

### Acceptance Criteria

* Fully keyboard navigable
* Screen reader friendly

---

# 6. SEO & METADATA

Add:

```html
<title>Zohn Sports Stats</title>
<meta name="description" content="Sports statistics dashboard" />
```

Also include Open Graph tags.

---

# 7. SECURITY

### Tasks

* Move secrets to environment variables
* Sanitize all dynamic content

---

# 8. TESTING

### Tasks

* Unit tests (Vitest/Jest)
* Component tests (Testing Library)

---

# 9. DEV EXPERIENCE (DX)

### Tasks

* ESLint + Prettier
* TypeScript
* Husky (pre-commit hooks)

---

# 10. FUTURE BIG-PICTURE IMPROVEMENTS

* Backend API (Node / Cloudflare Workers)
* Real-time updates
* User accounts & saved filters
* Advanced analytics (charts, trends)

---

# 11. PRIORITY ROADMAP

## Phase 1

* Fix data loading
* Add error handling
* Add loading states

## Phase 2

* Refactor architecture
* Add filtering/sorting
* Optimize performance

## Phase 3

* Add backend
* Advanced UI features

---

# FINAL INSTRUCTION FOR CLAUDE CODE

* Make incremental changes only
* Prioritize performance + stability
* Keep components small and reusable
* Avoid overengineering

---

**End of CLAUDE_CODE_TASKS.md**
