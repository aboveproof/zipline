import { verifyAccessToken } from '@/lib/accessToken';
import { ApiError } from '@/lib/api/errors';
import { db, type DbClient } from '@/lib/db';
import { fileRequests, files, folders } from '@/lib/db/schema';
import { fileRequestAccepts, normalizeAllowedTypes } from '@/lib/fileRequestTypes';
import { and, count, desc, eq, getColumns, isNotNull, sql, sum } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-orm/zod';
import { z } from 'zod';

export { fileRequestAccepts, normalizeAllowedTypes };

export const fileRequestScalarSchema = createSelectSchema(fileRequests, {
  allowedTypes: z.array(z.string()),
}).omit({ password: true, userId: true });

export const fileRequestSchema = fileRequestScalarSchema.extend({
  passwordProtected: z.boolean(),
  receivedFiles: z.number(),
  receivedBytes: z.number(),
  folderName: z.string().nullable(),
});

export const publicFileRequestSchema = fileRequestSchema
  .pick({
    id: true,
    name: true,
    description: true,
    expiresAt: true,
    maxFiles: true,
    maxBytes: true,
    closeAtBytes: true,
    allowedTypes: true,
    passwordProtected: true,
    receivedFiles: true,
    receivedBytes: true,
  })
  .extend({ open: z.boolean() });

export type FileRequest = z.infer<typeof fileRequestSchema>;
export type PublicFileRequest = z.infer<typeof publicFileRequestSchema>;

export function fileRequestIsOpen(
  request: Pick<
    FileRequest,
    'enabled' | 'expiresAt' | 'maxFiles' | 'maxBytes' | 'closeAtBytes' | 'receivedFiles' | 'receivedBytes'
  >,
  now = new Date(),
) {
  return (
    request.enabled &&
    (!request.expiresAt || request.expiresAt > now) &&
    (request.maxFiles === null || request.receivedFiles < request.maxFiles) &&
    (request.closeAtBytes === null || request.receivedBytes < request.closeAtBytes)
  );
}

const { password: _password, userId: _userId, ...fileRequestColumns } = getColumns(fileRequests);

export async function listFileRequests(userId: string, id?: string, client: DbClient = db) {
  return client
    .select({
      ...fileRequestColumns,
      passwordProtected: isNotNull(fileRequests.password).mapWith(Boolean),
      receivedFiles: count(files.id).mapWith(Number),
      receivedBytes: sql<number>`coalesce(sum(${files.size}), 0)`.mapWith(Number),
      folderName: folders.name,
    })
    .from(fileRequests)
    .leftJoin(files, eq(files.fileRequestId, fileRequests.id))
    .leftJoin(folders, eq(folders.id, fileRequests.folderId))
    .where(and(eq(fileRequests.userId, userId), id ? eq(fileRequests.id, id) : undefined))
    .groupBy(...Object.values(fileRequestColumns), fileRequests.password, folders.name)
    .orderBy(desc(fileRequests.createdAt));
}

export async function getFileRequestUploadContext(
  id: string,
  accessToken: string | undefined,
  client: DbClient = db,
) {
  const request = await client.query.fileRequests.findFirst({ where: { id } });
  if (!request) throw new ApiError(4012);
  if (!request.enabled || (request.expiresAt && request.expiresAt <= new Date())) throw new ApiError(1073);
  if (request.password && !verifyAccessToken(accessToken, 'fileRequest', request.id))
    throw new ApiError(3004);

  return request;
}

export async function preflightFileRequestUpload(
  requestId: string,
  incoming: { size: number; type: string; filename: string }[],
  client: DbClient = db,
) {
  const [request] = await client.select().from(fileRequests).where(eq(fileRequests.id, requestId));
  if (!request) throw new ApiError(4012);
  if (!request.enabled || (request.expiresAt && request.expiresAt <= new Date())) throw new ApiError(1073);

  if (incoming.some((file) => !fileRequestAccepts(file.type, file.filename, request.allowedTypes)))
    throw new ApiError(1075);

  const [usage] = await client
    .select({ files: count(), bytes: sum(files.size) })
    .from(files)
    .where(and(eq(files.fileRequestId, request.id), eq(files.userId, request.userId)));
  const nextFiles = Number(usage?.files ?? 0) + incoming.length;
  const nextBytes = Number(usage?.bytes ?? 0) + incoming.reduce((total, file) => total + file.size, 0);

  if (request.maxFiles !== null && nextFiles > request.maxFiles) throw new ApiError(1074);
  if (request.maxBytes !== null && nextBytes > request.maxBytes) throw new ApiError(1074);
  if (request.closeAtBytes !== null && nextBytes > request.closeAtBytes) throw new ApiError(1074);

  return request;
}

export async function validateFileRequestUpload(
  requestId: string,
  incoming: { size: number; type: string; filename: string }[],
  client: DbClient,
) {
  const [request] = await client
    .select()
    .from(fileRequests)
    .where(eq(fileRequests.id, requestId))
    .for('update');
  if (!request) throw new ApiError(4012);
  if (!request.enabled || (request.expiresAt && request.expiresAt <= new Date())) throw new ApiError(1073);

  if (incoming.some((file) => !fileRequestAccepts(file.type, file.filename, request.allowedTypes)))
    throw new ApiError(1075);

  const [usage] = await client
    .select({ files: count(), bytes: sum(files.size) })
    .from(files)
    .where(and(eq(files.fileRequestId, request.id), eq(files.userId, request.userId)));
  const nextFiles = Number(usage?.files ?? 0) + incoming.length;
  const nextBytes = Number(usage?.bytes ?? 0) + incoming.reduce((total, file) => total + file.size, 0);

  if (request.maxFiles !== null && nextFiles > request.maxFiles) throw new ApiError(1074);
  if (request.maxBytes !== null && nextBytes > request.maxBytes) throw new ApiError(1074);
  if (request.closeAtBytes !== null && nextBytes > request.closeAtBytes) throw new ApiError(1074);

  return request;
}
