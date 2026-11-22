import ConfigProvider from '@/components/ConfigProvider';
import UploadFile from '@/components/pages/upload/File';
import FileUploadProvider from '@/components/upload/FileUploadProvider';
import { Response } from '@/lib/api/response';
import { bytes } from '@/lib/bytes';
import { useTitle } from '@/lib/client/hooks/useTitle';
import { SafeConfig } from '@/lib/config/safe';
import { fetchApi } from '@/lib/fetchApi';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Pagination,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconClock, IconExternalLink, IconFileArrowRight, IconLock } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Params, useLoaderData } from 'react-router-dom';

type PublicRequest = Extract<Response['/api/file-request/[id]'], { open: boolean }>;

const FILES_PER_PAGE = 10;

export async function loader({ params }: { params: Params<string> }) {
  const route = params.route ? `/${params.route}` : '/request';
  const [requestResponse, configResponse] = await Promise.all([
    fetch(`/api/file-request/${params.id}?route=${encodeURIComponent(route)}`),
    fetch('/api/server/public'),
  ]);
  if (!requestResponse.ok) throw data('File request not found', { status: 404 });
  if (!configResponse.ok) throw data('Could not load server settings', { status: 500 });

  return {
    request: (await requestResponse.json()) as PublicRequest,
    config: (await configResponse.json()) as Response['/api/server/public'],
  };
}

export function Component() {
  const { t } = useTranslation('fileRequests');
  const { request: initialRequest, config } = useLoaderData<typeof loader>();
  const [refreshedState, setRefreshedState] = useState<{ id: string; request: PublicRequest } | null>(null);
  const [tokenState, setTokenState] = useState<{ id: string; token: string } | null>(null);
  const [filesPage, setFilesPage] = useState(1);

  const request = refreshedState?.id === initialRequest.id ? refreshedState.request : initialRequest;
  const token = tokenState?.id === initialRequest.id ? tokenState.token : undefined;
  const receivedList = request.files ?? [];
  const totalFilesPages = Math.max(1, Math.ceil(receivedList.length / FILES_PER_PAGE));
  const currentFilesPage = Math.min(filesPage, totalFilesPages);
  const pagedReceivedFiles = receivedList.slice(
    (currentFilesPage - 1) * FILES_PER_PAGE,
    currentFilesPage * FILES_PER_PAGE,
  );

  const refreshRequest = useCallback(
    async (accessToken?: string) => {
      const activeToken = accessToken ?? token;
      const { data: refreshed } = await fetchApi<PublicRequest>(
        `/api/file-request/${request.id}?route=${encodeURIComponent(request.route)}`,
        'GET',
        undefined,
        activeToken ? { 'x-zipline-file-request-token': activeToken } : undefined,
      );
      if (refreshed) setRefreshedState({ id: request.id, request: refreshed });
    },
    [request.id, request.route, token],
  );

  const uploadRequest = useMemo(
    () => ({ id: request.id, token, allowedTypes: request.allowedTypes }),
    [request.id, request.allowedTypes, token],
  );
  useTitle(t('public.pageTitle', { name: request.name }));

  const passwordForm = useForm({
    initialValues: { password: '' },
    validate: { password: (value) => (value ? null : t('public.passwordRequired')) },
  });

  const unlock = passwordForm.onSubmit(async ({ password }) => {
    const { data: result, error } = await fetchApi<{ token: string }>(
      `/api/file-request/${request.id}?route=${encodeURIComponent(request.route)}`,
      'POST',
      { password },
    );
    if (!result || error) {
      passwordForm.setFieldError('password', t('public.passwordInvalid'));
      return;
    }
    setTokenState({ id: request.id, token: result.token });
    passwordForm.reset();
    if (request.showReceivedFiles) void refreshRequest(result.token);
  });

  const unlocked = !request.passwordProtected || !!token;

  return (
    <Container size='md' my={{ base: 'md', sm: 'xl' }}>
      <Stack gap='md'>
        <div>
          <Group gap='xs' mb={4}>
            <IconFileArrowRight size='1.5rem' />
            <Title order={1}>{request.name}</Title>
          </Group>
          {request.description && (
            <Text c='dimmed' style={{ whiteSpace: 'pre-wrap' }}>
              {request.description}
            </Text>
          )}
          {request.expiresAt && (
            <Group gap={6} mt={6}>
              <IconClock size='0.9rem' />
              <Text c='dimmed' size='xs'>
                {t('public.closesAt', { date: new Date(request.expiresAt).toLocaleString() })}
              </Text>
            </Group>
          )}
        </div>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing='sm'>
          <Paper withBorder p='sm'>
            <Text c='dimmed' size='xs'>
              {t('public.filesReceived')}
            </Text>
            <Text fw={700}>
              {request.receivedFiles}
              {request.maxFiles ? ` / ${request.maxFiles}` : ''}
            </Text>
          </Paper>
          <Paper withBorder p='sm'>
            <Text c='dimmed' size='xs'>
              {t('public.sizeReceived')}
            </Text>
            <Text fw={700}>
              {bytes(request.receivedBytes)}
              {request.maxBytes || request.closeAtBytes
                ? ` / ${bytes((request.maxBytes ?? request.closeAtBytes)!)}`
                : ''}
            </Text>
          </Paper>
          <Paper withBorder p='sm'>
            <Text c='dimmed' size='xs'>
              {t('public.acceptedTypes')}
            </Text>
            <Group gap={5} mt={4}>
              {request.allowedTypes.length ? (
                request.allowedTypes.map((type) => (
                  <Badge key={type} variant='outline' color='gray'>
                    {type}
                  </Badge>
                ))
              ) : (
                <Text fw={700}>{t('public.anyType')}</Text>
              )}
            </Group>
          </Paper>
        </SimpleGrid>

        {!request.open ? (
          <Alert color='gray' title={t('public.closedTitle')}>
            {t('public.closedDescription')}
          </Alert>
        ) : !unlocked ? (
          <Paper withBorder p='lg'>
            <Center>
              <form onSubmit={unlock} style={{ width: '100%', maxWidth: 420 }}>
                <Stack>
                  <div>
                    <Group gap='xs'>
                      <IconLock size='1.2rem' />
                      <Text fw={700}>{t('public.passwordTitle')}</Text>
                    </Group>
                    <Text c='dimmed' size='sm'>
                      {t('public.passwordDescription')}
                    </Text>
                  </div>
                  <PasswordInput autoFocus {...passwordForm.getInputProps('password')} />
                  <Button type='submit' loading={passwordForm.submitting}>
                    {t('public.unlock')}
                  </Button>
                </Stack>
              </form>
            </Center>
          </Paper>
        ) : (
          <Paper withBorder p={{ base: 'sm', sm: 'md' }}>
            <ConfigProvider data={{ config: config as unknown as SafeConfig, codeMap: [] }}>
              <FileUploadProvider fileRequest={uploadRequest} onUploadComplete={refreshRequest}>
                <UploadFile title={t('public.uploadTitle')} fileRequest />
              </FileUploadProvider>
            </ConfigProvider>
          </Paper>
        )}

        {request.showReceivedFiles && unlocked && (
          <Paper withBorder p={{ base: 'sm', sm: 'md' }}>
            <Group justify='space-between' mb='xs'>
              <Text fw={700}>{t('public.receivedFilesTitle')}</Text>
              <Badge variant='light' color='gray'>
                {request.files?.length ?? request.receivedFiles}
              </Badge>
            </Group>
            {receivedList.length ? (
              <>
                <Stack gap={0}>
                  {pagedReceivedFiles.map((file, index) => (
                    <div key={file.id}>
                      {index > 0 && <Divider my='xs' />}
                      <Group justify='space-between' wrap='nowrap' gap='sm'>
                        <div style={{ minWidth: 0 }}>
                          <Anchor
                            href={file.url}
                            target='_blank'
                            rel='noreferrer'
                            fw={500}
                            size='sm'
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}
                          >
                            <Text span truncate>
                              {file.originalName ?? file.name}
                            </Text>
                            <IconExternalLink size='0.85rem' style={{ flex: '0 0 auto' }} />
                          </Anchor>
                          <Text c='dimmed' size='xs'>
                            {new Date(file.createdAt).toLocaleString()}
                          </Text>
                        </div>
                        <Text c='dimmed' size='xs' style={{ flex: '0 0 auto' }}>
                          {bytes(file.size)}
                        </Text>
                      </Group>
                    </div>
                  ))}
                </Stack>
                {totalFilesPages > 1 && (
                  <Center mt='md'>
                    <Pagination
                      value={currentFilesPage}
                      onChange={setFilesPage}
                      total={totalFilesPages}
                      size='sm'
                    />
                  </Center>
                )}
              </>
            ) : (
              <Text c='dimmed' size='sm'>
                {t('public.noReceivedFiles')}
              </Text>
            )}
          </Paper>
        )}

        <Text c='dimmed' size='xs' ta='center'>
          {t(request.showReceivedFiles ? 'public.privacyWithList' : 'public.privacy')}
        </Text>
      </Stack>
    </Container>
  );
}

Component.displayName = 'FileRequest';
