import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export type ColumnSortType = 'string' | 'number' | 'date' | ((a: unknown, b: unknown) => number);

export interface ColumnMeta {
  [key: string]: ColumnSortType;
}

function compareDates(a: unknown, b: unknown): number {
  const da = a ? new Date(String(a)).getTime() : 0;
  const db = b ? new Date(String(b)).getTime() : 0;
  if (isNaN(da) && isNaN(db)) return 0;
  if (isNaN(da)) return 1;
  if (isNaN(db)) return -1;
  return da - db;
}

function compareValues(aVal: unknown, bVal: unknown, sortType?: ColumnSortType): number {
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;

  if (typeof sortType === 'function') {
    return sortType(aVal, bVal);
  }

  if (sortType === 'date') {
    return compareDates(aVal, bVal);
  }

  if (sortType === 'number' || (typeof aVal === 'number' && typeof bVal === 'number')) {
    return Number(aVal) - Number(bVal);
  }

  return String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
}

export function useSortableTable<T>(
  data: T[],
  defaultSort?: SortConfig,
  columnMeta?: ColumnMeta
) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(defaultSort || null);

  const requestSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;
    const { key, direction } = sortConfig;
    const sortType = columnMeta?.[key];
    const sorted = [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[key];
      const bVal = (b as Record<string, unknown>)[key];
      const comparison = compareValues(aVal, bVal, sortType);
      return direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [data, sortConfig, columnMeta]);

  return { sortedData, sortConfig, requestSort };
}
