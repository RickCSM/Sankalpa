import { useMemo, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';
import {
  useListDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useListTags,
  useCreateTag,
  useUpdateTag,
  useListDistricts,
  useCreateDistrict,
  useUpdateDistrict,
  useListBlocks,
  useCreateBlock,
  useUpdateBlock,
  useListOccasions,
  useCreateOccasion,
  useUpdateOccasion,
  getListDepartmentsQueryKey,
  getListCategoriesQueryKey,
  getListTagsQueryKey,
  getListDistrictsQueryKey,
  getListBlocksQueryKey,
  getListOccasionsQueryKey,
} from '@workspace/api-client-react';

type Entity = 'districts' | 'blocks' | 'occasions' | 'departments' | 'categories' | 'tags';

interface Row {
  id: number;
  name: string;
  isActive: boolean;
  districtId?: number;
}

const ENTITY_META: Record<Entity, { title: string; singular: string; icon: string; description: string }> = {
  districts:   { title: 'Districts',   singular: 'District',   icon: 'bi-geo-alt-fill',       description: 'Administrative districts used in announcements' },
  blocks:      { title: 'Blocks',      singular: 'Block',      icon: 'bi-grid-3x3-gap-fill',  description: 'Blocks within each district' },
  occasions:   { title: 'Occasions',   singular: 'Occasion',   icon: 'bi-calendar-event-fill', description: 'Event types for announcements and UOI notes' },
  departments: { title: 'Departments', singular: 'Department', icon: 'bi-building-fill',       description: 'Government departments issuing announcements' },
  categories:  { title: 'Categories',  singular: 'Category',   icon: 'bi-folder-fill',         description: 'Content categories for announcements' },
  tags:        { title: 'Tags',        singular: 'Tag',        icon: 'bi-tags-fill',           description: 'Keywords and labels for filtering content' },
};

const ENTITY_TABS: Entity[] = ['districts', 'blocks', 'occasions', 'departments', 'categories', 'tags'];

function extractMessage(err: unknown, fallback: string): string {
  return getFriendlyErrorMessage(err, fallback);
}

export default function MastersPage() {
  const [, params] = useRoute('/masters/:entity');
  const [, navigate] = useLocation();
  const entity = (params?.entity as Entity) ?? 'districts';
  const { can } = useAuth();
  const canManage = can('manage_master_data');

  if (!ENTITY_TABS.includes(entity)) {
    return (
      <Layout>
        <div className="content-area"><h2>Unknown master entity</h2></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="content-area masters-page">
        <div className="page-header">
          <div>
            <h4 style={{ margin: 0 }}>Master Data</h4>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Manage reference values used across the platform
            </p>
          </div>
        </div>

        <div className="masters-tabs">
          {ENTITY_TABS.map((e) => (
            <button
              key={e}
              className={`masters-tab${entity === e ? ' active' : ''}`}
              onClick={() => navigate(`/masters/${e}`)}
            >
              <i className={`bi ${ENTITY_META[e].icon}`}></i>
              <span className="masters-tab-label">{ENTITY_META[e].title}</span>
            </button>
          ))}
        </div>

        <div className="masters-panel card">
          <div className="masters-panel-header">
            <div className="masters-panel-title">
              <i className={`bi ${ENTITY_META[entity].icon} masters-panel-icon`}></i>
              <div>
                <div className="masters-panel-name">{ENTITY_META[entity].title}</div>
                <div className="masters-panel-desc">{ENTITY_META[entity].description}</div>
              </div>
            </div>
          </div>
          <div className="masters-panel-body">
            {entity === 'blocks'
              ? <BlocksPanel canManage={canManage} />
              : <SimpleMasterPanel entity={entity} canManage={canManage} />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SimpleMasterPanel({ entity, canManage }: { entity: Exclude<Entity, 'blocks'>; canManage: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirmDialog();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');

  const hooks = useEntityHooks(entity);
  const listQuery = hooks.useList();
  const createMut = hooks.useCreate();
  const updateMut = hooks.useUpdate();

  const unknownQuery = useQuery({
    queryKey: ['occasions', 'unknown'],
    queryFn: async () => {
      const res = await fetch('/api/occasions/unknown', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load unknown occasions');
      return (await res.json()) as { unknown: string[] };
    },
    enabled: entity === 'occasions' && canManage,
  });
  const unknownOccasions = unknownQuery.data?.unknown ?? [];

  const promoteUnknown = async (name: string) => {
    try {
      await createMut.mutateAsync({ data: { name } } as any);
      invalidate();
      void qc.invalidateQueries({ queryKey: ['occasions', 'unknown'] });
    } catch (err) {
      setError(extractMessage(err, 'Failed to add to master'));
    }
  };

  const rows: Row[] = useMemo(() => {
    const data: any = listQuery.data;
    if (!data) return [];
    return (data[entity] ?? []) as Row[];
  }, [listQuery.data, entity]);

  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const f = rows.filter((r) => (showInactive || r.isActive) && (term === '' || r.name.toLowerCase().includes(term)));
    const sorted = [...f].sort((a, b) => a.name.localeCompare(b.name));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [rows, showInactive, search, sortDir]);

  const activeCount = rows.filter((r) => r.isActive).length;
  const invalidate = () => qc.invalidateQueries({ queryKey: hooks.listKey() });

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { setError('Name is required'); return; }
    try {
      await createMut.mutateAsync({ data: { name } } as any);
      setNewName('');
      setError('');
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to add'));
    }
  };

  const startEdit = (r: Row) => { setEditingId(r.id); setEditName(r.name); setError(''); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) { setError('Name is required'); return; }
    try {
      await updateMut.mutateAsync({ id, data: { name } } as any);
      cancelEdit();
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to rename'));
    }
  };

  const toggleActive = async (r: Row) => {
    const ok = await confirm({
      title: r.isActive ? `Disable ${ENTITY_META[entity].singular}?` : `Enable ${ENTITY_META[entity].singular}?`,
      message: r.isActive
        ? `"${r.name}" will be hidden from dropdowns. Existing records that reference it are not affected.`
        : `"${r.name}" will be available in dropdowns again.`,
      confirmLabel: r.isActive ? 'Disable' : 'Enable',
      variant: r.isActive ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      await updateMut.mutateAsync({ id: r.id, data: { isActive: !r.isActive } } as any);
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to update'));
    }
  };

  const singular = ENTITY_META[entity].singular.toLowerCase();

  return (
    <div>
      {/* Pending-review banner for occasions */}
      {entity === 'occasions' && canManage && unknownOccasions.length > 0 && (
        <div className="masters-review-banner">
          <div className="masters-review-banner-header">
            <i className="bi bi-exclamation-triangle-fill masters-review-icon"></i>
            <div>
              <div className="masters-review-title">
                {unknownOccasions.length} occasion{unknownOccasions.length === 1 ? '' : 's'} pending review
              </div>
              <div className="masters-review-sub">
                These values were typed on announcements or UOI notes but aren't in the master. Promote any you want available in dropdowns.
              </div>
            </div>
          </div>
          <div className="masters-review-chips">
            {unknownOccasions.map((name) => (
              <button
                key={name}
                type="button"
                className="masters-review-chip"
                onClick={() => promoteUnknown(name)}
                disabled={createMut.isPending}
              >
                <i className="bi bi-plus-lg"></i>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="masters-toolbar">
        {canManage && (
          <div className="masters-add-row">
            <input
              className="masters-add-input"
              placeholder={`New ${singular} name…`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              className="btn btn-primary masters-add-btn"
              onClick={handleAdd}
              disabled={createMut.isPending}
            >
              <i className="bi bi-plus-lg"></i>
              Add {ENTITY_META[entity].singular}
            </button>
          </div>
        )}

        <div className="masters-search-row">
          <div className="table-search-bar" style={{ maxWidth: 320 }}>
            <i className="bi bi-search table-search-icon"></i>
            <input
              className="table-search-input"
              placeholder={`Search ${ENTITY_META[entity].title.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="table-search-clear" onClick={() => setSearch('')}>
                <i className="bi bi-x"></i>
              </button>
            )}
          </div>

          <label className="masters-toggle-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="masters-toggle-check"
            />
            Show disabled
          </label>

          <div className="masters-counts">
            <span className="masters-count-pill active">{activeCount} active</span>
            {rows.length - activeCount > 0 && (
              <span className="masters-count-pill inactive">{rows.length - activeCount} disabled</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="masters-error">
          <i className="bi bi-exclamation-circle-fill"></i>
          {error}
        </div>
      )}

      {/* Table */}
      {listQuery.isPending ? (
        <div className="masters-loading">
          <div className="masters-skeleton" />
          <div className="masters-skeleton" style={{ width: '80%' }} />
          <div className="masters-skeleton" style={{ width: '65%' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="masters-empty">
          <i className={`bi ${ENTITY_META[entity].icon} masters-empty-icon`}></i>
          <div className="masters-empty-title">
            {search ? `No results for "${search}"` : `No ${ENTITY_META[entity].title.toLowerCase()} yet`}
          </div>
          {!search && canManage && (
            <div className="masters-empty-hint">Add your first {singular} using the field above.</div>
          )}
        </div>
      ) : (
        <table className="table masters-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th
                className="sortable-th"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                Name
                <i className={`bi ${sortDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down'} ms-1`} style={{ fontSize: 11 }}></i>
              </th>
              <th style={{ width: 110 }}>Status</th>
              {canManage && <th style={{ width: 120, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} className={!r.isActive ? 'masters-row-disabled' : ''}>
                <td className="masters-idx">{i + 1}</td>
                <td>
                  {editingId === r.id ? (
                    <input
                      className="masters-inline-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(r.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="masters-name">{r.name}</span>
                  )}
                </td>
                <td>
                  <span className={`masters-status-badge ${r.isActive ? 'active' : 'disabled'}`}>
                    <i className={`bi ${r.isActive ? 'bi-check-circle-fill' : 'bi-slash-circle'}`}></i>
                    {r.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <div className="masters-actions">
                      {editingId === r.id ? (
                        <>
                          <button
                            className="masters-action-btn save"
                            title="Save"
                            onClick={() => saveEdit(r.id)}
                            disabled={updateMut.isPending}
                          >
                            <i className="bi bi-check-lg"></i>
                          </button>
                          <button
                            className="masters-action-btn cancel"
                            title="Cancel"
                            onClick={cancelEdit}
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="masters-action-btn edit"
                            title="Rename"
                            onClick={() => startEdit(r)}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            className={`masters-action-btn ${r.isActive ? 'disable' : 'enable'}`}
                            title={r.isActive ? 'Disable' : 'Enable'}
                            onClick={() => toggleActive(r)}
                          >
                            <i className={`bi ${r.isActive ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BlocksPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirmDialog();
  const districtsQuery = useListDistricts({ query: { queryKey: getListDistrictsQueryKey() } });
  const allDistricts = districtsQuery.data?.districts ?? [];
  const activeDistricts = allDistricts.filter((d) => d.isActive);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
  const effectiveDistrictId = selectedDistrictId ?? activeDistricts[0]?.id ?? null;
  const params = effectiveDistrictId ? { districtId: effectiveDistrictId } : undefined;
  const blocksQuery = useListBlocks(params, {
    query: { queryKey: getListBlocksQueryKey(params), enabled: effectiveDistrictId !== null },
  });
  const createMut = useCreateBlock();
  const updateMut = useUpdateBlock();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const districtNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of allDistricts) m.set(d.id, d.name);
    return m;
  }, [allDistricts]);

  const selectedDistrict = effectiveDistrictId ? districtNameById.get(effectiveDistrictId) ?? '' : '';

  const blocks = blocksQuery.data?.blocks ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const f = blocks.filter((b) => (showInactive || b.isActive) && (term === '' || b.name.toLowerCase().includes(term)));
    const sorted = [...f].sort((a, b) => a.name.localeCompare(b.name));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [blocks, showInactive, search, sortDir]);

  const activeCount = blocks.filter((b) => b.isActive).length;
  const invalidate = () => qc.invalidateQueries({ queryKey: getListBlocksQueryKey(params) });

  const handleAdd = async () => {
    if (!effectiveDistrictId) { setError('Select a district first'); return; }
    const name = newName.trim();
    if (!name) { setError('Name is required'); return; }
    try {
      await createMut.mutateAsync({ data: { name, districtId: effectiveDistrictId } });
      setNewName('');
      setError('');
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to add block'));
    }
  };

  const startEdit = (b: { id: number; name: string }) => { setEditingId(b.id); setEditName(b.name); setError(''); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) { setError('Name is required'); return; }
    try {
      await updateMut.mutateAsync({ id, data: { name } });
      cancelEdit();
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to rename'));
    }
  };

  const toggleActive = async (b: { id: number; name: string; isActive: boolean }) => {
    const ok = await confirm({
      title: b.isActive ? 'Disable Block?' : 'Enable Block?',
      message: `"${b.name}" will be ${b.isActive ? 'hidden from' : 'available in'} block dropdowns.`,
      confirmLabel: b.isActive ? 'Disable' : 'Enable',
      variant: b.isActive ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      await updateMut.mutateAsync({ id: b.id, data: { isActive: !b.isActive } });
      invalidate();
    } catch (err) {
      setError(extractMessage(err, 'Failed to update'));
    }
  };

  return (
    <div>
      {/* District selector */}
      <div className="masters-district-bar">
        <label className="masters-district-label">
          <i className="bi bi-geo-alt-fill"></i>
          District
        </label>
        <select
          className="masters-district-select"
          value={effectiveDistrictId ?? ''}
          onChange={(e) => setSelectedDistrictId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Select district —</option>
          {allDistricts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{!d.isActive ? ' (disabled)' : ''}
            </option>
          ))}
        </select>
        {selectedDistrict && (
          <span className="masters-district-badge">
            <i className="bi bi-geo-alt-fill"></i>
            {selectedDistrict}
          </span>
        )}
      </div>

      {!effectiveDistrictId ? (
        <div className="masters-empty">
          <i className="bi bi-grid-3x3-gap-fill masters-empty-icon"></i>
          <div className="masters-empty-title">Select a district to view its blocks</div>
          <div className="masters-empty-hint">Choose a district from the dropdown above.</div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="masters-toolbar">
            {canManage && (
              <div className="masters-add-row">
                <input
                  className="masters-add-input"
                  placeholder={`New block name in ${selectedDistrict}…`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
                <button
                  className="btn btn-primary masters-add-btn"
                  onClick={handleAdd}
                  disabled={createMut.isPending}
                >
                  <i className="bi bi-plus-lg"></i>
                  Add Block
                </button>
              </div>
            )}

            <div className="masters-search-row">
              <div className="table-search-bar" style={{ maxWidth: 320 }}>
                <i className="bi bi-search table-search-icon"></i>
                <input
                  className="table-search-input"
                  placeholder="Search blocks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="table-search-clear" onClick={() => setSearch('')}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>

              <label className="masters-toggle-label">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="masters-toggle-check"
                />
                Show disabled
              </label>

              <div className="masters-counts">
                <span className="masters-count-pill active">{activeCount} active</span>
                {blocks.length - activeCount > 0 && (
                  <span className="masters-count-pill inactive">{blocks.length - activeCount} disabled</span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="masters-error">
              <i className="bi bi-exclamation-circle-fill"></i>
              {error}
            </div>
          )}

          {blocksQuery.isPending ? (
            <div className="masters-loading">
              <div className="masters-skeleton" />
              <div className="masters-skeleton" style={{ width: '80%' }} />
              <div className="masters-skeleton" style={{ width: '65%' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="masters-empty">
              <i className="bi bi-grid-3x3-gap-fill masters-empty-icon"></i>
              <div className="masters-empty-title">
                {search ? `No results for "${search}"` : `No blocks in ${selectedDistrict} yet`}
              </div>
              {!search && canManage && (
                <div className="masters-empty-hint">Add the first block using the field above.</div>
              )}
            </div>
          ) : (
            <table className="table masters-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th
                    className="sortable-th"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  >
                    Name
                    <i className={`bi ${sortDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down'} ms-1`} style={{ fontSize: 11 }}></i>
                  </th>
                  <th style={{ width: 110 }}>Status</th>
                  {canManage && <th style={{ width: 120, textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id} className={!b.isActive ? 'masters-row-disabled' : ''}>
                    <td className="masters-idx">{i + 1}</td>
                    <td>
                      {editingId === b.id ? (
                        <input
                          className="masters-inline-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(b.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="masters-name">{b.name}</span>
                      )}
                    </td>
                    <td>
                      <span className={`masters-status-badge ${b.isActive ? 'active' : 'disabled'}`}>
                        <i className={`bi ${b.isActive ? 'bi-check-circle-fill' : 'bi-slash-circle'}`}></i>
                        {b.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="masters-actions">
                          {editingId === b.id ? (
                            <>
                              <button
                                className="masters-action-btn save"
                                title="Save"
                                onClick={() => saveEdit(b.id)}
                                disabled={updateMut.isPending}
                              >
                                <i className="bi bi-check-lg"></i>
                              </button>
                              <button
                                className="masters-action-btn cancel"
                                title="Cancel"
                                onClick={cancelEdit}
                              >
                                <i className="bi bi-x-lg"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="masters-action-btn edit"
                                title="Rename"
                                onClick={() => startEdit(b)}
                              >
                                <i className="bi bi-pencil"></i>
                              </button>
                              <button
                                className={`masters-action-btn ${b.isActive ? 'disable' : 'enable'}`}
                                title={b.isActive ? 'Disable' : 'Enable'}
                                onClick={() => toggleActive(b)}
                              >
                                <i className={`bi ${b.isActive ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function useEntityHooks(entity: Exclude<Entity, 'blocks'>) {
  switch (entity) {
    case 'departments':
      return {
        useList: () => useListDepartments({ query: { queryKey: getListDepartmentsQueryKey() } }),
        useCreate: () => useCreateDepartment(),
        useUpdate: () => useUpdateDepartment(),
        listKey: () => getListDepartmentsQueryKey(),
      };
    case 'categories':
      return {
        useList: () => useListCategories({ query: { queryKey: getListCategoriesQueryKey() } }),
        useCreate: () => useCreateCategory(),
        useUpdate: () => useUpdateCategory(),
        listKey: () => getListCategoriesQueryKey(),
      };
    case 'tags':
      return {
        useList: () => useListTags({ query: { queryKey: getListTagsQueryKey() } }),
        useCreate: () => useCreateTag(),
        useUpdate: () => useUpdateTag(),
        listKey: () => getListTagsQueryKey(),
      };
    case 'districts':
      return {
        useList: () => useListDistricts({ query: { queryKey: getListDistrictsQueryKey() } }),
        useCreate: () => useCreateDistrict(),
        useUpdate: () => useUpdateDistrict(),
        listKey: () => getListDistrictsQueryKey(),
      };
    case 'occasions':
      return {
        useList: () => useListOccasions({ query: { queryKey: getListOccasionsQueryKey() } }),
        useCreate: () => useCreateOccasion(),
        useUpdate: () => useUpdateOccasion(),
        listKey: () => getListOccasionsQueryKey(),
      };
  }
}
