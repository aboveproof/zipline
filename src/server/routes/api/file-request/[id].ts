import { createAccessToken, verifyAccessToken } from '@/lib/accessToken';
import { ApiError } from '@/lib/api/errors';
import { config } from '@/lib/config';
import { verifyPassword } from '@/lib/crypto';
import { db } from '@/lib/db';
import {
  fileRequestIsOpen,
  findFileRequestBySlug,
  listFileRequests,
  publicFileRequestSchema,
  type PublicFileRequest,
} from '@/lib/db/models/fileRequest';
import { files } from '@/lib/db/schema';
import { normalizeFileRequestRoute } from '@/lib/fileRequestTypes';
import { secondlyRatelimit } from '@/lib/ratelimits';
import { formatRootUrl } from '@/lib/url';
import typedPlugin from '@/server/typedPlugin';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

export type ApiFileRequestResponse = (PublicFileRequest & { open: boolean }) | { token: string };

const paramsSchema = z.object({ id: z.string() });
const querySchema = z.object({ route: z.string().optional() });
export const PATH = '/api/file-request/:id';

export default typedPlugin(
  async (server) => {
    server.get(
      PATH,
      {
        schema: {
          description: 'Get the public details and limits for a file request link.',
          params: paramsSchema,
          querystring: querySchema,
          response: { 200: publicFileRequestSchema },
        },
      },
      async (req, res) => {
        const route = req.query.route ? normalizeFileRequestRoute(req.query.route) : undefined;
        const row = await findFileRequestBySlug(req.params.id, route);
        if (!row) throw new ApiError(4012);

        const [request] = await listFileRequests(row.userId, row.id);
        if (!request) throw new ApiError(4012);

        const open = fileRequestIsOpen(request);
        const tokenHeader = req.headers['x-zipline-file-request-token'];
        const accessToken = typeof tokenHeader === 'string' ? tokenHeader : undefined;
        const canListFiles =
          request.showReceivedFiles &&
          (!request.passwordProtected || verifyAccessToken(accessToken, 'fileRequest', request.id));

        const receivedFilesList = canListFiles
          ? (
              await db
                .select({
                  id: files.id,
                  name: files.name,
                  originalName: files.originalName,
                  size: files.size,
                  type: files.type,
                  createdAt: files.createdAt,
                })
                .from(files)
                .where(and(eq(files.fileRequestId, request.id), eq(files.userId, row.userId)))
                .orderBy(desc(files.createdAt))
            ).map((file) => ({
              ...file,
              url: formatRootUrl(config.files.route, file.name),
            }))
          : undefined;

        const { enabled: _enabled, folderId: _folderId, folderName: _folderName, ...publicRequest } = request;
        return res.send({
          ...publicRequest,
          open,
          ...(receivedFilesList ? { files: receivedFilesList } : {}),
        });
      },
    );

    server.post(
      PATH,
      {
        schema: {
          description: 'Verify a file request password and return a short-lived upload token.',
          params: paramsSchema,
          querystring: querySchema,
          body: z.object({ password: z.string().max(256) }),
          response: { 200: z.object({ token: z.string() }) },
        },
        ...secondlyRatelimit(2),
      },
      async (req, res) => {
        const route = req.query.route ? normalizeFileRequestRoute(req.query.route) : undefined;
        const request = await findFileRequestBySlug(req.params.id, route);
        if (!request) throw new ApiError(4012);
        const [summary] = await listFileRequests(request.userId, request.id);
        if (!summary || !fileRequestIsOpen(summary)) throw new ApiError(1073);
        if (!request.password || !(await verifyPassword(req.body.password, request.password)))
          throw new ApiError(3005);

        return res.send({
          token: createAccessToken({ type: 'fileRequest', id: request.id, expiresIn: 2 * 60 * 60_000 }),
        });
      },
    );
  },
  { name: PATH },
);
