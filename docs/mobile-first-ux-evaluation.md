# Mobile-First UX Evaluation for v2

## Executive Summary

The current Job Monitor UI (v1.3.0) has **basic responsive support** but is **not mobile-first**. While navigation and header layouts adapt to mobile screens, data-intensive pages force horizontal scrolling on tables. A v2 mobile-first redesign would significantly improve the user experience for users checking job status on mobile devices.

**Overall Mobile Readiness Score: 6/10**

---

## Current State Analysis

### What Works Well

| Component | Pattern | Mobile Impact |
|-----------|---------|---------------|
| Navigation | Sheet (slide-out drawer) | Excellent mobile UX |
| Sidebar | `hidden md:flex` | Proper mobile hiding |
| Headers | `flex-col sm:flex-row` | Stacks on mobile |
| Summary Cards | `grid-cols-2 sm:grid-cols-4` | 2x2 grid on mobile |
| Padding | `p-4 md:p-6` | Tighter on mobile |
| Global Filter | `flex flex-wrap` | Wraps to multiple rows |

### Critical Issues

#### 1. Tables Force Horizontal Scroll (High Impact)

```tsx
// Running Jobs - forces 850px width
<div className="min-w-[850px]">
  <Table>...</Table>
</div>

// Job Health - forces 800px width
<div className="min-w-[800px]">
  <JobHealthTable ... />
</div>
```

**Impact**: On a 375px iPhone screen, users must scroll horizontally to see all columns. This is the #1 mobile UX pain point.

#### 2. High Data Density Tables

The Job Health table shows 8 columns:
- Expand button
- Job Name
- Status (success rate)
- Priority
- SLA Target
- Breach History (hidden on `md:`)
- Last Run
- Retries

Even with one column hidden, 7 columns don't fit on mobile.

#### 3. Small Touch Targets

```tsx
// 32x32px expand button - borderline acceptable
<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
  <ChevronDown className="h-4 w-4" />
</Button>
```

Apple recommends 44x44pt minimum touch targets.

#### 4. Filter Bar Overflows

```tsx
<div className="flex flex-wrap items-center gap-2 sm:gap-3">
  <Select className="w-[140px]" />  // Workspace
  <FilterPresets />                  // Presets dropdown
  <Select className="w-[130px]" />  // Team
  <Select className="w-[130px]" />  // Job
  <JobPatternInput />               // Pattern input
  <TimeRangePicker />               // Date picker
</div>
```

On mobile, this creates 2-3 rows of filters, consuming valuable screen real estate.

---

## Mobile-First Redesign Recommendations

### Priority 1: Card-Based Data Views (High Impact)

**Replace table rows with cards on mobile screens.**

```tsx
// Current: Table with horizontal scroll
<Table>
  <TableRow>
    <TableCell>Job Name</TableCell>
    <TableCell>Status</TableCell>
    <TableCell>Priority</TableCell>
    ...
  </TableRow>
</Table>

// Proposed: Responsive card on mobile
<div className="md:hidden">
  <JobCard job={job} />
</div>
<div className="hidden md:block">
  <Table>...</Table>
</div>
```

**JobCard Component Design:**
```tsx
function JobCard({ job }: { job: JobWithSla }) {
  return (
    <div className="p-4 border-b">
      {/* Header: Name + Priority */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium truncate">{job.job_name}</span>
        <PriorityBadge priority={job.priority} />
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between text-sm">
        <StatusIndicator rate={job.success_rate} />
        <span className="text-muted-foreground">
          {formatTimeAgo(job.last_run_time)}
        </span>
      </div>

      {/* Expandable details */}
      <Collapsible>
        <CollapsibleTrigger className="w-full text-sm text-blue-600">
          View details
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* SLA, Retries, History */}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
```

### Priority 2: Bottom Sheet Filter (High Impact)

**Replace inline filter bar with a bottom sheet on mobile.**

```tsx
// Mobile: Full-screen bottom sheet
<Sheet>
  <SheetTrigger asChild>
    <Button className="md:hidden fixed bottom-4 right-4 z-50 rounded-full shadow-lg">
      <Filter className="h-5 w-5" />
      {activeFilterCount > 0 && <Badge>{activeFilterCount}</Badge>}
    </Button>
  </SheetTrigger>
  <SheetContent side="bottom" className="h-[85vh]">
    <SheetHeader>
      <SheetTitle>Filters</SheetTitle>
    </SheetHeader>
    {/* Full-width filter controls */}
    <div className="space-y-4 p-4">
      <div>
        <Label>Workspace</Label>
        <Select className="w-full" />
      </div>
      <div>
        <Label>Team</Label>
        <Select className="w-full" />
      </div>
      {/* ... */}
    </div>
    <SheetFooter>
      <Button onClick={applyFilters}>Apply Filters</Button>
      <Button variant="outline" onClick={clearFilters}>Clear</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>

// Desktop: Keep existing inline filter bar
<div className="hidden md:block">
  <GlobalFilterBar />
</div>
```

### Priority 3: Touch-Optimized Elements (Medium Impact)

**Increase touch target sizes:**

```tsx
// Current
<Button size="sm" className="h-8 w-8">

// Proposed for mobile
<Button size="sm" className="h-10 w-10 md:h-8 md:w-8">
```

**Make entire row clickable for expand:**

```tsx
// Current: Only chevron button expands
<CollapsibleTrigger asChild>
  <Button className="h-8 w-8">
    <ChevronDown />
  </Button>
</CollapsibleTrigger>

// Proposed: Entire row expands (except links)
<CollapsibleTrigger asChild>
  <div className="w-full cursor-pointer">
    {/* Card content */}
  </div>
</CollapsibleTrigger>
```

### Priority 4: Simplified Mobile Navigation (Medium Impact)

**Add quick-access sticky header on mobile:**

```tsx
// Sticky header with key metrics
<div className="md:hidden sticky top-0 z-40 bg-background border-b p-3">
  <div className="flex items-center justify-between">
    <h1 className="font-semibold text-lg">Job Health</h1>
    <div className="flex gap-2 text-sm">
      <Badge variant="destructive">{criticalCount} P1</Badge>
      <Badge variant="warning">{warningCount} P2</Badge>
    </div>
  </div>
</div>
```

### Priority 5: Swipe Actions (Low Impact - Nice to Have)

**Enable swipe gestures on job cards:**

```tsx
// Swipe left: Quick actions (View in Databricks, Acknowledge)
// Swipe right: Expand details
<SwipeableCard
  onSwipeLeft={() => setShowActions(true)}
  onSwipeRight={() => setExpanded(true)}
>
  <JobCard job={job} />
</SwipeableCard>
```

---

## Component-Specific Recommendations

### Dashboard

**Current**: Good mobile support with responsive grid.

**Enhancements**:
- Make metric cards larger on mobile (remove `sm:grid-cols-2` transition, go directly to 1 column)
- Recent activity list: Show fewer items on mobile (3 instead of 5)

### Running Jobs

**Current**: Table with horizontal scroll + sortable columns.

**Mobile v2**:
- Card view with job name, state badge, duration
- Single-tap to expand showing recent runs icons
- Sticky "RUNNING: 15" counter at top
- Pull-to-refresh gesture

### Job Health

**Current**: Dense 8-column table with pagination.

**Mobile v2**:
- Card view with visual status indicator (green/yellow/red)
- Priority badge prominent
- Success rate as progress bar
- Tap to see SLA details

### Alerts

**Current**: Table with severity badges.

**Mobile v2**:
- Timeline-style list (similar to iOS notifications)
- Group by severity with collapsible sections
- Swipe to acknowledge

### Historical

**Current**: Charts with tab navigation.

**Mobile v2**:
- Full-width charts with proper touch scrolling
- Date range picker as bottom sheet
- Summary cards at top before charts

---

## Implementation Approach

### Phase 1: Foundation (Week 1-2)

1. Create responsive breakpoint utilities
2. Build `JobCard` component
3. Add `useIsMobile()` hook
4. Create bottom sheet filter component

### Phase 2: Page Migration (Week 3-4)

1. Job Health page - card view
2. Running Jobs page - card view
3. Alerts page - timeline view
4. Dashboard - optimize cards

### Phase 3: Polish (Week 5)

1. Touch target audit
2. Animation/transition refinement
3. Pull-to-refresh
4. Performance testing on mobile devices

---

## Technical Considerations

### New Dependencies

```json
{
  "react-swipeable": "^7.0.0",  // Swipe gestures (optional)
  "@radix-ui/react-scroll-area": "^1.0.0"  // Better mobile scrolling
}
```

### CSS Additions

```css
/* Safe area insets for iPhone notch */
.mobile-safe-area {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Prevent iOS bounce scroll on fixed elements */
.no-bounce {
  overscroll-behavior: contain;
}

/* Larger touch targets */
@media (max-width: 768px) {
  .touch-target {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Performance Considerations

- Virtualization already in place for large lists (good)
- Consider `content-visibility: auto` for off-screen cards
- Lazy load expanded content on mobile
- Reduce data fetched on initial mobile load

---

## Metrics for Success

| Metric | Current | Target v2 |
|--------|---------|-----------|
| Horizontal scroll pages | 4/5 | 0/5 |
| Touch target compliance | ~60% | 100% |
| Time to first interaction (mobile) | ~3s | <2s |
| Filter access taps | 2-3 | 1 |
| Card view available | No | Yes |

---

## Appendix: Mobile Viewport Reference

| Device | Width | Notes |
|--------|-------|-------|
| iPhone SE | 375px | Minimum target |
| iPhone 14 | 390px | Common size |
| iPhone 14 Pro Max | 430px | Larger phones |
| iPad Mini | 768px | Tablet breakpoint |

Current breakpoints in Tailwind:
- `sm`: 640px
- `md`: 768px (tablet)
- `lg`: 1024px (desktop)
- `xl`: 1280px (large desktop)

---

*Evaluation Date: 2026-02-28*
*Version: v1.3.0 → v2.0 Planning*
