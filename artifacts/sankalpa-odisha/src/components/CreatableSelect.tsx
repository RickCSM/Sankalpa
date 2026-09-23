import { useState, useRef, useEffect } from 'react';

interface CreatableSelectProps {
  options: string[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onAddOption: (option: string) => void;
  placeholder?: string;
  multi?: boolean;
  canCreate?: boolean;
}

export default function CreatableSelect({
  options,
  value,
  onChange,
  onAddOption,
  placeholder = 'Select...',
  multi = false,
  canCreate = true,
}: CreatableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()) &&
    (multi ? !(value as string[]).includes(o) : true)
  );

  const exactMatch = options.some(o => o.toLowerCase() === search.trim().toLowerCase());
  const canAdd = canCreate && search.trim().length > 0 && !exactMatch;

  const handleSelect = (option: string) => {
    if (multi) {
      const current = value as string[];
      if (!current.includes(option)) {
        onChange([...current, option]);
      }
    } else {
      onChange(option);
      setIsOpen(false);
    }
    setSearch('');
  };

  const handleAdd = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    onAddOption(trimmed);
    handleSelect(trimmed);
  };

  const handleRemoveTag = (tag: string) => {
    if (multi) {
      onChange((value as string[]).filter(v => v !== tag));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAdd) {
        handleAdd();
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      }
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (multi) {
      onChange([]);
    } else {
      onChange('');
    }
  };

  const hasValue = multi ? (value as string[]).length > 0 : !!(value as string);

  return (
    <div className="creatable-select" ref={containerRef}>
      <div
        className={`creatable-select-control ${isOpen ? 'focused' : ''}`}
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
      >
        {multi && (value as string[]).length > 0 && (
          <div className="creatable-chips">
            {(value as string[]).map(tag => (
              <span key={tag} className="creatable-chip">
                {tag}
                <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}>
                  <i className="bi bi-x"></i>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="creatable-input-row">
          {!multi && !isOpen && (value as string) && (
            <span className="creatable-single-value">{value as string}</span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="creatable-search-input"
            value={search}
            onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={!multi && (value as string) ? '' : (multi && (value as string[]).length > 0 ? 'Add more...' : placeholder)}
          />
          <div className="creatable-indicators">
            {hasValue && (
              <button type="button" className="creatable-clear" onClick={handleClear} title="Clear">
                <i className="bi bi-x-lg"></i>
              </button>
            )}
            <span className="creatable-separator"></span>
            <span className="creatable-arrow">
              <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
            </span>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="creatable-dropdown">
          {filtered.length === 0 && !canAdd && (
            <div className="creatable-no-options">No options available</div>
          )}
          {filtered.map(option => (
            <div
              key={option}
              className={`creatable-option ${!multi && (value as string) === option ? 'selected' : ''}`}
              onClick={() => handleSelect(option)}
            >
              {option}
              {!multi && (value as string) === option && (
                <i className="bi bi-check2" style={{ marginLeft: 'auto', color: '#1a3a5c' }}></i>
              )}
            </div>
          ))}
          {canAdd && (
            <div className="creatable-option creatable-add-option" onClick={handleAdd}>
              <i className="bi bi-plus-circle" style={{ marginRight: 6 }}></i>
              Add "<strong>{search.trim()}</strong>"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
