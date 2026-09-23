import type { SortConfig } from '@/hooks/useSortableTable';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function SortableHeader({ label, sortKey, sortConfig, onSort, className, style }: SortableHeaderProps) {
  const isActive = sortConfig?.key === sortKey;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <th
      className={`sortable-th${isActive ? ' sorted' : ''}${className ? ' ' + className : ''}`}
      style={style}
      onClick={() => onSort(sortKey)}
    >
      <span className="sortable-th-content">
        {label}
        <span className="sort-arrows">
          <span className={`sort-arrow up${direction === 'asc' ? ' active' : ''}`}>▲</span>
          <span className={`sort-arrow down${direction === 'desc' ? ' active' : ''}`}>▼</span>
        </span>
      </span>
    </th>
  );
}
