import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import axios from 'axios';
import { getResourceMimeType, getWorkDriveViewerUrl, validateResourceFile, MAX_RESOURCE_FILE_SIZE } from '../src/lib/resourceFiles.mjs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(path.resolve('src', `${specifier.slice(2)}.js`)).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { default: zohoClient, ZohoCRMClient } = await import('../src/lib/zohoClient.js');
const { uploadResourceTemplateFile } = await import('../src/lib/resourceTemplates.js');
const { uploadSharedResourceFile } = await import('../src/lib/sharedResources.js');
const viewerUrl = 'https://workdrive.zohopublic.com.au/external/view-only-link';
const file = (name, type = '') => new File(['document contents'], name, { type });

test('PDF, Word, OpenDocument, spreadsheet and presentation MIME types survive missing browser types', () => {
  for (const [name, mime] of [
    ['guide.PDF', 'application/pdf'], ['guide.DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['guide.doc', 'application/msword'], ['guide.odt', 'application/vnd.oasis.opendocument.text'],
    ['data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['notes.txt', 'text/plain'],
  ]) assert.equal(getResourceMimeType(file(name)), mime);
  assert.equal(getResourceMimeType(file('image.webp', 'image/webp')), 'image/webp');
  assert.equal(getResourceMimeType(file('archive.custom')), 'application/octet-stream');
});

test('upload validation accepts other formats and a 50 MB boundary, rejects empty and oversized files', () => {
  assert.equal(validateResourceFile(file('archive.zip')), null);
  assert.equal(validateResourceFile({ size: MAX_RESOURCE_FILE_SIZE, arrayBuffer() {} }), null);
  assert.match(validateResourceFile({ size: MAX_RESOURCE_FILE_SIZE + 1, arrayBuffer() {} }), /50 MB/);
  assert.match(validateResourceFile(new File([], 'empty.docx')), /Empty/);
  assert.match(validateResourceFile('not-a-file'), /required/);
});

test('viewer URL policy excludes download endpoints, foreign hosts, credentials and redirects', () => {
  assert.equal(getWorkDriveViewerUrl(viewerUrl), viewerUrl);
  for (const candidate of [
    `${viewerUrl}/download`, `${viewerUrl}?directDownload=true`, `${viewerUrl}#download`,
    'https://workdrive.zohopublic.com.au.evil.test/external/link',
    'https://workdrive.zohopublic.com.au/external/link/download/../download',
    'https://user:pass@workdrive.zohopublic.com.au/external/link',
    'https://files.zohopublic.com.au/public/workdrive-public/download/file',
    'http://workdrive.zohopublic.com.au/external/link',
  ]) assert.equal(getWorkDriveViewerUrl(candidate), null, candidate);
});

test('provider request disables downloads for Resource Center while preserving document-review default', async (t) => {
  const client = new ZohoCRMClient();
  t.mock.method(client, 'getWorkDriveAccessToken', async () => 'test-token');
  const requests = [];
  t.mock.method(axios, 'post', async (_url, body) => {
    requests.push(body.data.attributes);
    return { data: { data: { id: 'link', attributes: {
      link: viewerUrl, download_url: `${viewerUrl}/download`, allow_download: body.data.attributes.allow_download,
    } } } };
  });
  const restricted = await client.createWorkDrivePublicLink('file', 'Guide', { allowDownload: false });
  assert.equal(restricted.allowDownload, false);
  assert.equal(restricted.downloadUrl, null);
  await client.createWorkDrivePublicLink('review-file', 'Review');
  assert.equal(requests[0].allow_download, false);
  assert.equal(requests[0].role_id, '34');
  assert.equal(requests[1].allow_download, true);
});

test('provider restriction fails closed when response is unrestricted or unconfirmed', async (t) => {
  const client = new ZohoCRMClient();
  t.mock.method(client, 'getWorkDriveAccessToken', async () => 'test-token');
  for (const allowDownload of [true, undefined]) {
    const mock = t.mock.method(axios, 'post', async () => ({ data: { data: { attributes: {
      link: viewerUrl, allow_download: allowDownload,
    } } } }));
    await assert.rejects(client.createWorkDrivePublicLink('file', 'Guide', { allowDownload: false }), /did not confirm/);
    mock.mock.restore();
  }
});

test('migration link update checks the returned restriction before exposing a viewer', async (t) => {
  const client = new ZohoCRMClient();
  t.mock.method(client, 'makeWorkDriveJsonRequest', async (method, endpoint, body) => {
    assert.equal(method, 'PATCH');
    assert.equal(endpoint, '/links/link');
    assert.equal(body.data.attributes.allow_download, false);
    return { data: { id: 'link', attributes: { link: viewerUrl, allow_download: false } } };
  });
  assert.equal((await client.updateWorkDriveLinkDownload('link')).allowDownload, false);
  await assert.rejects(client.updateWorkDriveLinkDownload('../file'), /valid/);
});

for (const [label, upload] of [
  ['template', (input) => uploadResourceTemplateFile(input, 'Guide', 'folder')],
  ['shared', (input) => uploadSharedResourceFile(input, 'Guide')],
]) {
  test(`${label} upload stores a verified view-only DOCX link without raw download aliases`, async (t) => {
    t.mock.method(zohoClient, 'uploadWorkDriveFile', async (_folder, _bytes, name, mime) => {
      assert.equal(name, 'guide.docx');
      assert.equal(mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      return { resourceId: 'file', downloadUrl: 'raw-source-sentinel', permalink: 'raw-permalink-sentinel' };
    });
    t.mock.method(zohoClient, 'createWorkDrivePublicLink', async (_id, _name, options) => {
      assert.equal(options.allowDownload, false);
      return { link: viewerUrl, linkId: 'link', allowDownload: false, downloadUrl: 'raw-download-sentinel' };
    });
    const result = await upload(file('guide.docx'));
    assert.equal(result.data.downloadAllowed, false);
    assert.equal(result.data.externalUrl || result.data.publicUrl, viewerUrl);
    assert.equal(result.data.downloadUrl, undefined);
    assert.equal(result.data.workDrivePermalink, undefined);
    assert.ok(!JSON.stringify(result).includes('sentinel'));
  });

  test(`${label} upload removes uploaded file if restricted sharing cannot be established`, async (t) => {
    t.mock.method(zohoClient, 'uploadWorkDriveFile', async () => ({ resourceId: 'file' }));
    t.mock.method(zohoClient, 'createWorkDrivePublicLink', async () => ({ link: viewerUrl, allowDownload: true }));
    const cleanup = t.mock.method(zohoClient, 'deleteWorkDriveResource', async () => ({}));
    await assert.rejects(upload(file('guide.pdf')), /did not confirm/);
    assert.equal(cleanup.mock.calls[0].arguments[0], 'file');
  });
}
