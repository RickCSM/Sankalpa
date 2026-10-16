import { test } from 'node:test';
import assert from 'node:assert/strict';
import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { announcementFacetFilters } from './announcementFacetFilters';

const dialect = new PgDialect();

test('blank or malformed announcement facets do not filter the list', () => {
  assert.deepEqual(announcementFacetFilters({}), []);
  assert.deepEqual(announcementFacetFilters({ occasion: '  ', tag: '' }), []);
  assert.deepEqual(announcementFacetFilters({ occasion: ['Visit'], tag: { name: 'Water' } }), []);
});

test('occasion filter uses an exact, trimmed, bound value', () => {
  const [filter] = announcementFacetFilters({ occasion: '  Visit  ' });
  const query = dialect.sqlToQuery(filter);
  assert.match(query.sql, /"occasion" = \$1/);
  assert.deepEqual(query.params, ['Visit']);
});

test('relevant tag uses exact array membership, not substring matching', () => {
  const [filter] = announcementFacetFilters({ tag: "Water_%' OR true --" });
  const query = dialect.sqlToQuery(filter);
  assert.match(query.sql, /\$1 = ANY\("announcements"\."tags"\)/);
  assert.deepEqual(query.params, ["Water_%' OR true --"]);
  assert.ok(!query.sql.includes('OR true'));
});

test('occasion and relevant tag are combined with AND before pagination', () => {
  const filters = announcementFacetFilters({ occasion: 'Visit', tag: 'Water' });
  assert.equal(filters.length, 2);
  const query = dialect.sqlToQuery(and(...filters)!);
  assert.match(query.sql, / and /);
  assert.deepEqual(query.params, ['Visit', 'Water']);
});
