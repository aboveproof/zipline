import { fileRequestAccepts, fileRequestIsOpen, normalizeAllowedTypes } from '@/lib/db/models/fileRequest';
import { isValidFileRequestVanity } from '@/lib/fileRequestTypes';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('file request vanity validation accepts URL-safe slugs and rejects slashes or spaces', () => {
  assert.equal(isValidFileRequestVanity('wedding-photos_2026'), true);
  assert.equal(isValidFileRequestVanity('client/files'), false);
  assert.equal(isValidFileRequestVanity('my photos'), false);
  assert.equal(isValidFileRequestVanity(''), false);
});

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

test('file count, expiration, and disabled flag close file requests', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  assert.equal(
    fileRequestIsOpen(
      {
        enabled: true,
        expiresAt: null,
        maxFiles: 5,
        maxBytes: null,
        closeAtBytes: null,
        receivedFiles: 5,
        receivedBytes: 0,
      },
      now,
    ),
    false,
  );
  assert.equal(
    fileRequestIsOpen(
      {
        enabled: true,
        expiresAt: new Date('2026-11-21T11:59:59Z'),
        maxFiles: null,
        maxBytes: null,
        closeAtBytes: null,
        receivedFiles: 0,
        receivedBytes: 0,
      },
      now,
    ),
    false,
  );
  assert.equal(
    fileRequestIsOpen(
      {
        enabled: false,
        expiresAt: null,
        maxFiles: null,
        maxBytes: null,
        closeAtBytes: null,
        receivedFiles: 0,
        receivedBytes: 0,
      },
      now,
    ),
    false,
  );
});
