import { ApiError, RedirectError } from '@/lib/api/errors';
import { findFileRequestBySlug } from '@/lib/db/models/fileRequest';
import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

export function registerHandlers(server: FastifyInstance, mode: string) {
  server.setNotFoundHandler(async (req, res) => {
    if (mode === 'development' && server.vite)
      return res.status(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: 'Not Found',
        statusCode: 404,
        dev: true,
      });

    if (req.url.startsWith('/api/')) {
      return res.status(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    } else {
      if (req.method === 'GET') {
        const pathname = req.url.split('?')[0];
        const match = /^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/.exec(pathname);
        if (match) {
          const [, prefix, slug] = match;
          const fileRequest = await findFileRequestBySlug(slug, `/${prefix}`);
          if (fileRequest) {
            res.status(200);
            return res.serveIndex();
          }
        }
      }

      res.status(404);
      return res.serveIndex();
    }
  });

  server.setErrorHandler((error: any, _, res) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return res.status(400).send({
        error: error.message ?? 'E1000: Invalid response schema',
        statusCode: 400,
        code: 1000,
        issues: error.validation,
      });
    }

    if (isResponseSerializationError(error)) {
      console.log(error);

      return res.status(500).send({
        error: 'E1000: Response serialization error',
        statusCode: 500,
        code: 1000,
        details: error.message,
      });
    }

    if (error instanceof RedirectError) {
      return res.redirect(error.url);
    }

    if (error instanceof ApiError) {
      const apiError = error as ApiError;
      return res.status(apiError.status).send(apiError.toJSON());
    }

    if (error.statusCode) {
      return res.status(error.statusCode).send({ error: error.message, statusCode: error.statusCode });
    } else {
      console.error(error);

      return res.status(500).send({
        code: 9000,
        error: 'E9000: Internal Server Error',
        statusCode: 500,
      });
    }
  });
}
