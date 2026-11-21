import { Response } from '@/lib/api/response';
import { bytes } from '@/lib/bytes';
import { useFolders } from '@/lib/client/hooks/useFolders';
import { fetchApi } from '@/lib/fetchApi';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconClipboardCopy,
  IconClock,
  IconEdit,
  IconFileArrowRight,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type FileRequestList = Extract<Response['/api/user/file-requests'], any[]>;
type FileRequest = FileRequestList[number];

type FormValues = {
  name: string;
  description: string;
  enabled: boolean;
  password: string;
  removePassword: boolean;
  expiresEnabled: boolean;
  expiresAt: Date | null;
  maxFilesEnabled: boolean;
  maxFiles: number | string;
  maxSizeEnabled: boolean;
  maxSize: number | string;
  maxSizeUnit: SizeUnit;
  allowedTypes: string[];
  folderId: string | null;
};

const sizeUnits = {
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
} as const;

type SizeUnit = keyof typeof sizeUnits;

function editableSize(value: number | null): { amount: number | string; unit: SizeUnit } {
  if (!value) return { amount: '', unit: 'MB' };
  const unit =
    (Object.entries(sizeUnits) as [SizeUnit, number][])
      .reverse()
      .find(([, multiplier]) => value >= multiplier)?.[0] ?? 'KB';
  return { amount: Number((value / sizeUnits[unit]).toFixed(2)), unit };
}

const initialValues: FormValues = {
  name: '',
  description: '',
  enabled: true,
  password: '',
  removePassword: false,
  expiresEnabled: false,
  expiresAt: null,
  maxFilesEnabled: false,
  maxFiles: '',
  maxSizeEnabled: false,
  maxSize: '',
  maxSizeUnit: 'MB',
  allowedTypes: [],
  folderId: null,
};

export default function DashboardFileRequests() {
  const { t } = useTranslation(['fileRequests', 'common']);
  const { data, error, isLoading, mutate } = useSWR<FileRequestList>('/api/user/file-requests');
  const { data: folders } = useFolders();
  const [editing, setEditing] = useState<FileRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [now] = useState(() => new Date());

  const form = useForm<FormValues>({
    initialValues,
    validate: {
      name: (value) => (value.trim() ? null : t('form.nameRequired')),
      maxFiles: (value, values) => (values.maxFilesEnabled && value === '' ? t('form.limitRequired') : null),
      maxSize: (value, values) => (values.maxSizeEnabled && value === '' ? t('form.limitRequired') : null),
      expiresAt: (value, values) =>
        values.expiresEnabled && value === null ? t('form.expirationRequired') : null,
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.setValues(initialValues);
    form.resetDirty();
    setModalOpen(true);
  };

  const openEdit = (request: FileRequest) => {
    const maxSize = editableSize(request.maxBytes);
    setEditing(request);
    form.setValues({
      name: request.name,
      description: request.description ?? '',
      enabled: request.enabled,
      password: '',
      removePassword: false,
      expiresEnabled: request.expiresAt !== null,
      expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
      maxFilesEnabled: request.maxFiles !== null,
      maxFiles: request.maxFiles ?? '',
      maxSizeEnabled: request.maxBytes !== null,
      maxSize: maxSize.amount,
      maxSizeUnit: maxSize.unit,
      allowedTypes: request.allowedTypes,
      folderId: request.folderId,
    });
    form.resetDirty();
    setModalOpen(true);
  };

  const submit = form.onSubmit(async (values) => {
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      enabled: values.enabled,
      expiresAt: values.expiresEnabled ? (values.expiresAt?.toISOString() ?? null) : null,
      maxFiles: values.maxFilesEnabled && values.maxFiles !== '' ? Number(values.maxFiles) : null,
      maxBytes:
        values.maxSizeEnabled && values.maxSize !== ''
          ? Math.round(Number(values.maxSize) * sizeUnits[values.maxSizeUnit])
          : null,
      allowedTypes: values.allowedTypes.map((value) => value.trim()).filter(Boolean),
      folderId: values.folderId || null,
      ...(values.removePassword ? { password: null } : values.password ? { password: values.password } : {}),
    };

    const route = editing ? `/api/user/file-requests/${editing.id}` : '/api/user/file-requests';
    const { error: saveError } = await fetchApi(route, editing ? 'PATCH' : 'POST', payload);
    if (saveError) {
      notifications.show({
        title: t('notifications.saveFailed'),
        message: saveError.error,
        color: 'red',
      });
      return;
    }

    notifications.show({
      message: t(editing ? 'notifications.updated' : 'notifications.created'),
      color: 'green',
    });
    setModalOpen(false);
    await mutate();
  });

  const remove = (request: FileRequest) => {
    modals.openConfirmModal({
      title: t('delete.title', { name: request.name }),
      children: <Text size='sm'>{t('delete.description')}</Text>,
      confirmProps: { color: 'red' },
      labels: { cancel: t('common:actions.cancel'), confirm: t('delete.confirm') },
      onConfirm: async () => {
        const { error: deleteError } = await fetchApi(`/api/user/file-requests/${request.id}`, 'DELETE');
        if (deleteError) {
          notifications.show({
            title: t('notifications.deleteFailed'),
            message: deleteError.error,
            color: 'red',
          });
          return;
        }
        notifications.show({ message: t('notifications.deleted'), color: 'green' });
        await mutate();
      },
    });
  };

  return (
    <>
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('form.editTitle') : t('form.createTitle')}
        size='xl'
        centered
      >
        <form onSubmit={submit}>
          <Stack gap='lg'>
            <Stack gap='xs'>
              <div>
                <Text fw={600}>{t('form.sections.details')}</Text>
                <Text c='dimmed' size='sm'>
                  {t('form.sections.detailsHelp')}
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label={t('form.name')}
                  placeholder={t('form.namePlaceholder')}
                  {...form.getInputProps('name')}
                />
                <Select
                  clearable
                  searchable
                  label={t('form.folder')}
                  placeholder={t('form.rootFolder')}
                  data={(folders ?? []).map((folder) => ({ value: folder.id, label: folder.name }))}
                  {...form.getInputProps('folderId')}
                />
              </SimpleGrid>
            </Stack>
            <Textarea
              label={t('form.description')}
              description={t('form.descriptionHelp')}
              autosize
              minRows={2}
              maxRows={5}
              {...form.getInputProps('description')}
            />

            <Divider />

            <Stack gap='xs'>
              <div>
                <Text fw={600}>{t('form.sections.closing')}</Text>
                <Text c='dimmed' size='sm'>
                  {t('form.sections.closingHelp')}
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Paper withBorder p='sm'>
                  <Switch
                    label={t('form.stopAfterFiles')}
                    description={t('form.stopAfterFilesHelp')}
                    {...form.getInputProps('maxFilesEnabled', { type: 'checkbox' })}
                  />
                  <NumberInput
                    mt='sm'
                    aria-label={t('form.maxFiles')}
                    placeholder={t('form.fileCountPlaceholder')}
                    min={1}
                    max={1000}
                    allowDecimal={false}
                    disabled={!form.values.maxFilesEnabled}
                    {...form.getInputProps('maxFiles')}
                  />
                </Paper>
                <Paper withBorder p='sm'>
                  <Switch
                    label={t('form.stopAfterSize')}
                    description={t('form.stopAfterSizeHelp')}
                    {...form.getInputProps('maxSizeEnabled', { type: 'checkbox' })}
                  />
                  <Group mt='sm' gap='xs' align='flex-start' wrap='nowrap'>
                    <NumberInput
                      aria-label={t('form.maxSize')}
                      placeholder={t('form.sizePlaceholder')}
                      min={0.01}
                      decimalScale={2}
                      disabled={!form.values.maxSizeEnabled}
                      style={{ flex: 1 }}
                      {...form.getInputProps('maxSize')}
                    />
                    <Select
                      aria-label={t('form.sizeUnit')}
                      data={Object.keys(sizeUnits)}
                      allowDeselect={false}
                      disabled={!form.values.maxSizeEnabled}
                      w={88}
                      {...form.getInputProps('maxSizeUnit')}
                    />
                  </Group>
                </Paper>
                <Paper withBorder p='sm'>
                  <Switch
                    label={t('form.stopAtTime')}
                    description={t('form.stopAtTimeHelp')}
                    {...form.getInputProps('expiresEnabled', { type: 'checkbox' })}
                  />
                  <DateTimePicker
                    mt='sm'
                    clearable
                    minDate={now}
                    aria-label={t('form.expiresAt')}
                    placeholder={t('form.timePlaceholder')}
                    disabled={!form.values.expiresEnabled}
                    {...form.getInputProps('expiresAt')}
                  />
                </Paper>
              </SimpleGrid>
            </Stack>

            <Divider />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing='lg'>
              <Stack gap='xs'>
                <div>
                  <Text fw={600}>{t('form.sections.files')}</Text>
                  <Text c='dimmed' size='sm'>
                    {t('form.sections.filesHelp')}
                  </Text>
                </div>
                <TagsInput
                  label={t('form.allowedTypes')}
                  description={t('form.allowedTypesHelp')}
                  placeholder={t('form.allowedTypesPlaceholder')}
                  splitChars={[',', ' ']}
                  clearable
                  {...form.getInputProps('allowedTypes')}
                />
              </Stack>
              <Stack gap='xs'>
                <div>
                  <Text fw={600}>{t('form.sections.access')}</Text>
                  <Text c='dimmed' size='sm'>
                    {t('form.sections.accessHelp')}
                  </Text>
                </div>
                <PasswordInput
                  label={t('form.password')}
                  description={editing ? t('form.passwordEditHelp') : t('form.passwordHelp')}
                  disabled={form.values.removePassword}
                  {...form.getInputProps('password')}
                />
                {editing?.passwordProtected && (
                  <Switch
                    label={t('form.removePassword')}
                    {...form.getInputProps('removePassword', { type: 'checkbox' })}
                  />
                )}
              </Stack>
            </SimpleGrid>

            <Paper withBorder p='sm'>
              <Switch
                label={t('form.enabled')}
                description={t('form.enabledHelp')}
                {...form.getInputProps('enabled', { type: 'checkbox' })}
              />
            </Paper>
            <Group justify='flex-end'>
              <Button variant='default' onClick={() => setModalOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type='submit' loading={form.submitting}>
                {t(editing ? 'form.save' : 'form.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Group justify='space-between' align='flex-start' mb='md'>
        <div>
          <Title order={1}>{t('title')}</Title>
          <Text c='dimmed'>{t('description')}</Text>
        </div>
        <Button leftSection={<IconPlus size='1rem' />} onClick={openCreate}>
          {t('create')}
        </Button>
      </Group>

      {error ? (
        <Alert color='red' title={t('loadError')}>
          {error.message}
        </Alert>
      ) : isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}>
          <Skeleton h={190} />
          <Skeleton h={190} />
        </SimpleGrid>
      ) : data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}>
          {data.map((request) => {
            const expired = !!request.expiresAt && new Date(request.expiresAt) <= now;
            const full =
              (request.maxFiles !== null && request.receivedFiles >= request.maxFiles) ||
              (request.maxBytes !== null && request.receivedBytes >= request.maxBytes);
            const open = request.enabled && !expired && !full;
            const url = `${window.location.origin}/request/${request.id}`;
            const closingRules = [
              request.maxFiles !== null ? t('card.closesAfterFiles', { count: request.maxFiles }) : null,
              request.maxBytes !== null ? t('card.closesAfterSize', { size: bytes(request.maxBytes) }) : null,
              request.expiresAt
                ? t('card.closesAt', { date: new Date(request.expiresAt).toLocaleString() })
                : null,
            ].filter(Boolean);
            return (
              <Paper withBorder p='sm' key={request.id}>
                <Group justify='space-between' align='flex-start' wrap='nowrap'>
                  <div style={{ minWidth: 0 }}>
                    <Group gap='xs'>
                      <Text fw={700} truncate>
                        {request.name}
                      </Text>
                      <Badge color={open ? 'green' : 'gray'} variant='light'>
                        {t(
                          open
                            ? 'status.open'
                            : expired
                              ? 'status.expired'
                              : full
                                ? 'status.full'
                                : 'status.closed',
                        )}
                      </Badge>
                    </Group>
                    {request.description && (
                      <Text c='dimmed' size='sm' lineClamp={1} mt={4}>
                        {request.description}
                      </Text>
                    )}
                  </div>
                  <Group gap={4} wrap='nowrap'>
                    <CopyButton value={url}>
                      {({ copied, copy }) => (
                        <Tooltip label={t(copied ? 'copied' : 'copy')}>
                          <ActionIcon variant='subtle' onClick={copy} aria-label={t('copy')}>
                            {copied ? <IconCheck size='1rem' /> : <IconClipboardCopy size='1rem' />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Tooltip label={t('edit')}>
                      <ActionIcon variant='subtle' onClick={() => openEdit(request)} aria-label={t('edit')}>
                        <IconEdit size='1rem' />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('delete.button')}>
                      <ActionIcon
                        color='red'
                        variant='subtle'
                        onClick={() => remove(request)}
                        aria-label={t('delete.button')}
                      >
                        <IconTrash size='1rem' />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                <SimpleGrid cols={2} mt='sm' spacing='xs'>
                  <div>
                    <Text c='dimmed' size='xs'>
                      {t('receivedFiles')}
                    </Text>
                    <Text fw={600}>
                      {request.receivedFiles}
                      {request.maxFiles ? ` / ${request.maxFiles}` : ''}
                    </Text>
                  </div>
                  <div>
                    <Text c='dimmed' size='xs'>
                      {t('receivedSize')}
                    </Text>
                    <Text fw={600}>
                      {bytes(request.receivedBytes)}
                      {request.maxBytes ? ` / ${bytes(request.maxBytes)}` : ''}
                    </Text>
                  </div>
                  <div>
                    <Text c='dimmed' size='xs'>
                      {t('destination')}
                    </Text>
                    <Text size='sm'>{request.folderName ?? t('form.rootFolder')}</Text>
                  </div>
                  <div>
                    <Text c='dimmed' size='xs'>
                      {t('protection')}
                    </Text>
                    <Text size='sm'>
                      {request.passwordProtected ? t('passwordProtected') : t('linkOnly')}
                    </Text>
                  </div>
                </SimpleGrid>
                <Divider my='sm' />
                <Group gap={6} wrap='nowrap' align='flex-start'>
                  <IconClock size='0.9rem' style={{ flex: '0 0 auto', marginTop: 2 }} />
                  <Text c='dimmed' size='xs' lineClamp={2}>
                    {closingRules.length ? closingRules.join(` ${t('card.or')} `) : t('card.manualClose')}
                  </Text>
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>
      ) : (
        <Stack align='center' py={60} gap='xs'>
          <IconFileArrowRight size='2.5rem' stroke={1.5} />
          <Text fw={700}>{t('empty.title')}</Text>
          <Text c='dimmed' ta='center' maw={460}>
            {t('empty.description')}
          </Text>
          <Button mt='sm' leftSection={<IconPlus size='1rem' />} onClick={openCreate}>
            {t('create')}
          </Button>
        </Stack>
      )}
    </>
  );
}
