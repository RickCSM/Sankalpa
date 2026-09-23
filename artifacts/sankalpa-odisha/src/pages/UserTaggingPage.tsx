import Layout from '@/components/Layout';
import { departmentList, roleLabels } from '@/data/mockData';
import { useAppState } from '@/context/AppStateContext';
import { useSortableTable } from '@/hooks/useSortableTable';
import SortableHeader from '@/components/SortableHeader';

export default function UserTaggingPage() {
  const { users } = useAppState();
  const { sortedData, sortConfig, requestSort } = useSortableTable(users);

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <h4>User Tagging</h4>
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Select User</label>
                  <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }}>
                    <option value="">Select User</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Select Department</label>
                  <select style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }}>
                    <option value="">Select Department</option>
                    {departmentList.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <button className="btn-submit">Tag User</button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="User Name" sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Tagged Department" sortKey="department" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Role" sortKey="role" sortConfig={sortConfig} onSort={requestSort} />
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((user, idx) => (
                      <tr key={user.id}>
                        <td>{idx + 1}</td>
                        <td>{user.name}</td>
                        <td>{user.department || '-'}</td>
                        <td>{roleLabels[user.role]}</td>
                        <td>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545' }}>
                            <i className="bi bi-x-circle"></i> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
