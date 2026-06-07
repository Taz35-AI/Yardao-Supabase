// src/components/features/dashboard/VirtualizedCardGrid.tsx
// A responsive, windowed card grid for large vehicle lists (500+).
//
// • Columns are derived from the container's own width (container-responsive),
//   so the grid adapts to the space it's actually given, not just the viewport.
// • Rows are virtualized against the WINDOW scroll (the dashboard scrolls the
//   page, not an inner element), so only on-screen rows are mounted.
// • Row heights are MEASURED, not assumed — cards of differing height (e.g. an
//   optional MOT badge, or a model with art vs without) all work without config.
//
// Only the rendering strategy changes; each card's existing markup/styling is
// rendered verbatim via `renderItem`, so the visual result is unchanged.
'use client'

import React from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

interface VirtualizedCardGridProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  getKey: (item: T, index: number) => React.Key
  /** Minimum card width in px; column count is derived from container width. */
  minColumnWidth?: number
  /** Gap between cards in px. */
  gap?: number
  /** Initial per-row height estimate in px (refined by measurement). */
  estimateRowHeight?: number
  /** Extra rows rendered above/below the viewport. */
  overscan?: number
  className?: string
}

export function VirtualizedCardGrid<T>({
  items,
  renderItem,
  getKey,
  minColumnWidth = 210,
  gap = 12,
  estimateRowHeight = 210,
  overscan = 3,
  className = '',
}: VirtualizedCardGridProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const [columns, setColumns] = React.useState(1)
  const [scrollMargin, setScrollMargin] = React.useState(0)

  // Derive column count + scroll offset from the container's actual size.
  React.useLayoutEffect(() => {
    const el = parentRef.current
    if (!el) return
    const compute = () => {
      const width = el.clientWidth
      const cols = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))
      setColumns(cols)
      // Distance from the top of the document to this grid — the window
      // virtualizer needs it to map page scroll onto row offsets.
      const rect = el.getBoundingClientRect()
      setScrollMargin(rect.top + window.scrollY)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [gap, minColumnWidth])

  const rowCount = Math.ceil(items.length / columns)

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
    // Re-key measurements when the column layout changes.
    getItemKey: (index) => `r${columns}-${index}`,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className={className}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const start = virtualRow.index * columns
          const rowItems = items.slice(start, start + columns)
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                paddingBottom: `${gap}px`,
              }}
            >
              {rowItems.map((item, i) => (
                <React.Fragment key={getKey(item, start + i)}>
                  {renderItem(item, start + i)}
                </React.Fragment>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
