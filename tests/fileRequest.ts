import { fileRequestAccepts, fileRequestIsOpen, normalizeAllowedTypes } from '@/lib/db/models/fileRequest';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('file request type rules normalize extensions and MIME types', () => {
  assert.deepEqual(normalizeAllowedTypes([' .PNG, jpg ', 'image/*', 'application/pdf', 'jpg']), [
    'png',
    'jpg',
    'image/*',
    'application/pdf',
  ]);
});

test('file request type rules match extensions, exact MIME types, and MIME groups', () => {
  assert.equal(fileRequestAccepts('image/png', 'photo.PNG', ['png']), true);
  assert.equal(fileRequestAccepts('application/pdf', 'document.bin', ['application/pdf']), true);
  assert.equal(fileRequestAccepts('image/webp', 'photo.webp', ['image/*']), true);
  assert.equal(fileRequestAccepts('text/plain', 'notes.txt', ['png', 'application/pdf']), false);
  assert.equal(fileRequestAccepts('application/octet-stream', 'README', []), true);
});

test('storage caps do not close file requests', () => {
  assert.equal(
    fileRequestIsOpen({
      enabled: true,
      expiresAt: null,
      maxFiles: null,
      maxBytes: 10 * 1024 ** 3,
      closeAtBytes: null,
      receivedFiles: 3,
      receivedBytes: 10 * 1024 ** 3,
    }),
    true,
  );
});

test('storage closing thresholds close file requests', () => {
  assert.equal(
    fileRequestIsOpen({
      enabled: true,
      expiresAt: null,
      maxFiles: null,
      maxBytes: null,
      closeAtBytes: 10 * 1024 ** 3,
      receivedFiles: 3,
      receivedBytes: 10 * 1024 ** 3,
    }),
    false,
  );
});
