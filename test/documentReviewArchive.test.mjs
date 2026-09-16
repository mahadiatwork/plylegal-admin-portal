import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

let fixture;
const applicationRef = {
  path: 'applications/app',
  collection(name) {
    assert.equal(name, 'resources');
    return resourcesRef;
  },
};
const resourcesRef = {
  doc(id) {
    return {
      path: `applications/app/resources/${id}`,
      async get() {
        const resource = fixture.resources.find((item) => item.id === id);
        return { exists: Boolean(resource), data: () => resource };
      },
      async update(data) {
        const resource = fixture.resources.find((item) => item.id === id);
        Object.assign(resource, data);
        fixture.directUpdates.push({ id, data });
      },
    };
  },
  orderBy(field, direction) {
    assert.equal(field, 'createdAt');
    assert.equal(direction, 'desc');
    fixture.queries += 1;
    return {
      async get() {
        return {
          docs: [...fixture.resources]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((resource) => ({ id: resource.id, data: () => resource })),
        };
      },
    };
  },
};
const db = {
  collection(name) {
    assert.equal(name, 'applications');
    return {
      doc(id) {
        assert.equal(id, 'app');
        return applicationRef;
      },
    };
  },
  batch() {
    return {
      set(ref, data, options) { fixture.sets.push({ ref, data, options }); },
      update(ref, data) { fixture.updates.push({ ref, data }); },
      async commit() {
        if (fixture.rejectCommit) throw new Error('Commit rejected');
        fixture.commits += 1;
      },
    };
  },
  async runTransaction(callback) {
    const operations = [];
    const transaction = {
      async get(ref) { return ref.get(); },
      set(ref, data, options) { operations.push({ type: 'set', ref, data, options }); },
      update(ref, data) { operations.push({ type: 'update', ref, data }); },
    };
    const result = await callback(transaction);
    if (fixture.rejectCommit) throw new Error('Commit rejected');
    for (const operation of operations) {
      if (operation.type === 'set') {
        fixture.sets.push({ ref: operation.ref, data: operation.data, options: operation.options });
      } else {
        fixture.updates.push({ ref: operation.ref, data: operation.data });
      }
    }
    fixture.commits += 1;
    return result;
  },
};
const dependencies = {
  db,
  async getAdminSession() {
    return fixture?.adminSession === null ? null : { role: 'admin' };
  },
  async resolveMatterApplication() {
    return { appId: 'app', application: { id: 'app', zohoId: 'deal' } };
  },
  zohoClient: {
    async deleteWorkDriveResource(id) {
      fixture.pendingAtDelete = fixture.updates.some(
        (operation) =>
          operation.ref.path === `applications/app/resources/${id.replace('workdrive-', '')}` &&
          operation.data.workDriveCleanupPending === true
      );
      if (fixture.rejectDelete) throw new Error('WorkDrive delete rejected');
      fixture.deleted.push(id);
    },
    async updateRecord(module, id, data) {
      fixture.zohoUpdates.push({ module, id, data });
      if (fixture.rejectZohoUpdate) throw new Error('Zoho update rejected');
    },
  },
};

globalThis.__documentReviewArchiveDependencies = dependencies;
const mocks = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/adminSession': 'export const getAdminSession = globalThis.__documentReviewArchiveDependencies.getAdminSession;',
  '@/lib/firebase-admin': 'export const db = globalThis.__documentReviewArchiveDependencies.db; export const initResult = {};',
  '@/lib/matterResources.mjs': 'export function normalizeMatterResourceOrder(value, fallback) { if (value === null || value === undefined || value === "") return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }',
  '@/lib/matterResolver': 'export const resolveMatterApplication = globalThis.__documentReviewArchiveDependencies.resolveMatterApplication;',
  '@/lib/zohoClient': 'export default globalThis.__documentReviewArchiveDependencies.zohoClient;',
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { PATCH } = await import('../src/app/api/matter/[matterId]/resources/[resourceId]/route.js');
hooks.deregister();
delete globalThis.__documentReviewArchiveDependencies;

const review = (id, createdAt, extra = {}) => ({
  id,
  createdAt,
  source: 'documentReview',
  type: 'file',
  mimeType: 'application/pdf',
  fileName: `${id}.pdf`,
  status: 'active',
  publicUrl: `https://workdrive.zohopublic.com.au/external/${id}`,
  workDriveResourceId: `workdrive-${id}`,
  ...extra,
});

async function archive(resources, resourceId) {
  fixture = { resources, sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0, adminSession: { role: 'admin' }, rejectCommit: false };
  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/resource', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId }) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(fixture.deleted, [`workdrive-${resourceId}`]);
  assert.equal(fixture.commits, 1);
  assert.equal(fixture.updates.length, 1);
  assert.equal(fixture.updates[0].ref.path, `applications/app/resources/${resourceId}`);
  assert.equal(fixture.updates[0].data.status, 'archived');
  assert.equal(fixture.updates[0].data.workDriveCleanupPending, true);
  assert.equal(fixture.pendingAtDelete, true);
  assert.equal(fixture.directUpdates.length, 1);
  assert.equal(fixture.directUpdates[0].data.workDriveCleanupPending, false);
  return body;
}

test('archive requires an admin session before reading or deleting a resource', async () => {
  fixture = {
    resources: [review('only', new Date('2026-01-01'))],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: null, rejectCommit: false,
  };

  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/only', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'only' }) },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.commits, 0);
});

test('a failed Firestore archive commit never deletes the WorkDrive file', async () => {
  fixture = {
    resources: [review('only', new Date('2026-01-01'))],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: { role: 'admin' }, rejectCommit: true,
  };

  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/only', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'only' }) },
  );

  assert.equal(response.status, 500);
  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.commits, 0);
});

function assertFinalFileUrl(expected) {
  assert.equal(fixture.sets.length, 1);
  assert.equal(fixture.sets[0].ref, applicationRef);
  assert.equal(fixture.sets[0].data.Final_File_For_Visa_Submission, expected);
  assert.deepEqual(fixture.sets[0].options, { merge: true });
  assert.deepEqual(fixture.zohoUpdates, [{
    module: 'Deals', id: 'deal', data: { Final_File_For_Visa_Submission: expected },
  }]);
}

test('archiving one of several review PDFs preserves the newest remaining public URL', async () => {
  const remaining = review('newest-remaining', 30, { downloadUrl: 'https://files.test/download' });
  const result = await archive([
    review('older', 10), remaining, review('remove', 40),
    review('already-archived', 50, { status: 'archived' }),
    review('general-resource', 60, { source: 'resourceCenter' }),
    review('forged-link', 70, { type: 'link' }),
    review('forged-non-pdf', 80, { mimeType: 'text/plain', fileName: 'notes.txt' }),
  ], 'remove');
  assert.equal(result.finalFileUrl, remaining.publicUrl);
  assertFinalFileUrl(remaining.publicUrl);
});

test('archiving an older review PDF keeps the newest review PDF selected', async () => {
  const newest = review('newest', 20);
  const result = await archive([review('older', 10), newest], 'older');
  assert.equal(result.finalFileUrl, newest.publicUrl);
  assertFinalFileUrl(newest.publicUrl);
});

test('archiving the last review PDF clears the submission URL', async () => {
  const result = await archive([
    review('last', 10), review('old', 20, { status: 'archived' }),
    review('general', 30, { source: 'resourceCenter' }),
  ], 'last');
  assert.equal(result.finalFileUrl, null);
  assertFinalFileUrl(null);
});

test('archiving a general resource leaves the document review URL untouched', async () => {
  const result = await archive([
    review('review', 10), review('general', 20, { source: 'resourceCenter' }),
  ], 'general');
  assert.deepEqual(result, { success: true });
  assert.equal(fixture.queries, 0);
  assert.deepEqual(fixture.sets, []);
  assert.deepEqual(fixture.zohoUpdates, []);
});

test('failed WorkDrive cleanup remains visible for an explicit retry', async () => {
  fixture = {
    resources: [review('only', 10)],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: { role: 'admin' }, rejectCommit: false, rejectDelete: true,
  };

  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/only', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'only' }) },
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.archived, true);
  assert.equal(body.cleanupPending, true);
  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.updates[0].data.workDriveCleanupPending, true);
  assert.equal(fixture.pendingAtDelete, true);
  assert.deepEqual(fixture.directUpdates, []);
  assertFinalFileUrl(null);
});

test('failed Zoho final-file sync keeps WorkDrive cleanup pending without deleting the file', async () => {
  fixture = {
    resources: [review('only', 10)],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: { role: 'admin' }, rejectCommit: false, rejectDelete: false, rejectZohoUpdate: true,
  };

  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/only', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'only' }) },
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.cleanupPending, true);
  assert.equal(fixture.updates[0].data.workDriveCleanupPending, true);
  assert.deepEqual(fixture.deleted, []);
});

test('legacy review files without a WorkDrive ID retain and clear the Zoho retry marker', async () => {
  fixture = {
    resources: [review('legacy', 10, { workDriveResourceId: '' })],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: { role: 'admin' }, rejectCommit: false, rejectDelete: false, rejectZohoUpdate: true,
  };

  const request = () => PATCH(
    new Request('https://portal.test/api/matter/app/resources/legacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'legacy' }) },
  );

  const failedResponse = await request();
  assert.equal(failedResponse.status, 502);
  assert.equal(fixture.updates[0].data.workDriveCleanupPending, true);
  assert.deepEqual(fixture.deleted, []);

  fixture.rejectZohoUpdate = false;
  const retryResponse = await request();
  assert.equal(retryResponse.status, 200);
  assert.equal(fixture.directUpdates.at(-1).data.workDriveCleanupPending, false);
  assert.deepEqual(fixture.deleted, []);
});

test('retrying a pending WorkDrive cleanup clears the marker after deletion', async () => {
  fixture = {
    resources: [review('only', 10, { status: 'archived', workDriveCleanupPending: true })],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
    adminSession: { role: 'admin' }, rejectCommit: false, rejectDelete: false,
  };

  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/only', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'only' }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(fixture.deleted, ['workdrive-only']);
  assert.equal(fixture.directUpdates.at(-1).data.workDriveCleanupPending, false);
});

test('matter resource metadata can update without deleting or archiving the resource', async () => {
  fixture = {
    resources: [{ id: 'resource', title: 'Old title', category: 'Old', order: 20, status: 'active' }],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
  };
  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/resource', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New title', category: 'Guides', order: '5' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'resource' }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.resource.title, 'New title');
  assert.equal(body.resource.category, 'Guides');
  assert.equal(body.resource.order, 5);
  assert.equal(fixture.directUpdates.length, 1);
  assert.equal(fixture.directUpdates[0].data.order, 5);
  assert.equal(fixture.directUpdates[0].data.updatedBy, 'admin');
  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.commits, 0);
});

test('matter resource metadata rejects invalid order without writing', async () => {
  fixture = {
    resources: [{ id: 'resource', title: 'Resource', status: 'active' }],
    sets: [], updates: [], directUpdates: [], commits: 0, deleted: [], zohoUpdates: [], queries: 0,
  };
  const response = await PATCH(
    new Request('https://portal.test/api/matter/app/resources/resource', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: 'first' }),
    }),
    { params: Promise.resolve({ matterId: 'app', resourceId: 'resource' }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(fixture.directUpdates, []);
  assert.deepEqual(fixture.deleted, []);
});
