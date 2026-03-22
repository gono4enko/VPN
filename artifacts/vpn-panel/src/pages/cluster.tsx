import React, { useState } from 'react';
import { Layout } from '@/components/layout';
import {
  useListServers, useCreateServer, useUpdateServer, useDeleteServer,
  useSetPrimaryServer, useGetClusterStats,
  useTriggerClusterSync, useGetFailoverUrls,
  getListServersQueryKey, getGetClusterStatsQueryKey, getGetFailoverUrlsQueryKey,
  pingServer,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, Modal, CyberInput } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import {
  Plus, Trash2, Activity, Star, Server, Cpu, HardDrive,
  Users, Wifi, WifiOff, Wrench, RefreshCw, Link2, Copy, Check, ArrowDownUp,
} from 'lucide-react';

interface ServerForm {
  name: string;
  address: string;
  port: number;
  country: string;
  countryFlag: string;
  provider: string;
  maxClients: number;
  syncUrl: string;
  syncSecret: string;
}

const defaultForm: ServerForm = {
  name: '', address: '', port: 443, country: '', countryFlag: '🌐', provider: '', maxClients: 100, syncUrl: '', syncSecret: '',
};

function SyncStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "green" | "red" | "muted" | "default"; label: string }> = {
    synced: { variant: 'green', label: 'Синхронизирован' },
    syncing: { variant: 'default', label: 'Синхронизация...' },
    error: { variant: 'red', label: 'Ошибка синхр.' },
    idle: { variant: 'muted', label: 'Ожидание' },
  };
  const info = map[status] || map.idle;
  return <CyberBadge variant={info.variant}>{info.label}</CyberBadge>;
}

export default function ClusterPage() {
  const queryClient = useQueryClient();
  const { data: servers, isLoading } = useListServers({ query: { refetchInterval: 10000 } as never });
  const { data: stats } = useGetClusterStats({ query: { refetchInterval: 10000 } as never });
  const { data: failoverData } = useGetFailoverUrls({ query: { refetchInterval: 30000 } as never });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editServer, setEditServer] = useState<number | null>(null);
  const [form, setForm] = useState<ServerForm>(defaultForm);
  const [pinging, setPinging] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'servers' | 'failover'>('servers');

  const createMutation = useCreateServer();
  const updateMutation = useUpdateServer();
  const deleteMutation = useDeleteServer();
  const setPrimaryMutation = useSetPrimaryServer();
  const syncMutation = useTriggerClusterSync();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetClusterStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFailoverUrlsQueryKey() });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      data: {
        ...form, port: form.port || 443, maxClients: form.maxClients || 100,
        syncUrl: form.syncUrl || undefined, syncSecret: form.syncSecret || undefined,
      },
    });
    invalidate();
    setIsAddOpen(false);
    setForm(defaultForm);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editServer === null) return;
    await updateMutation.mutateAsync({
      id: editServer,
      data: {
        ...form,
        syncUrl: form.syncUrl || undefined,
        syncSecret: form.syncSecret || undefined,
      },
    });
    invalidate();
    setEditServer(null);
    setForm(defaultForm);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Удалить этот сервер из кластера?")) {
      await deleteMutation.mutateAsync({ id });
      invalidate();
    }
  };

  const handlePing = async (id: number) => {
    setPinging(id);
    try {
      await pingServer(id);
      invalidate();
    } catch {}
    setPinging(null);
  };

  const handleSetPrimary = async (id: number) => {
    await setPrimaryMutation.mutateAsync({ id });
    invalidate();
  };

  const handleSetStatus = async (id: number, status: string) => {
    await updateMutation.mutateAsync({ id, data: { status } });
    invalidate();
  };

  const handleSync = async () => {
    await syncMutation.mutateAsync();
    invalidate();
  };

  const handleCopyUrl = (userId: number, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(userId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEdit = (srv: { id: number; name: string; address: string; port: number; country: string; countryFlag: string; provider: string; maxClients: number; syncUrl?: string | null }) => {
    setForm({
      name: srv.name, address: srv.address, port: srv.port, country: srv.country,
      countryFlag: srv.countryFlag, provider: srv.provider, maxClients: srv.maxClients,
      syncUrl: srv.syncUrl || '', syncSecret: '',
    });
    setEditServer(srv.id);
  };

  const statusIcon = (status: string) => {
    if (status === 'online') return <Wifi className="w-4 h-4 text-green-400" />;
    if (status === 'maintenance') return <Wrench className="w-4 h-4 text-yellow-400" />;
    return <WifiOff className="w-4 h-4 text-red-400" />;
  };

  const statusColor = (status: string): "green" | "yellow" | "red" => {
    if (status === 'online') return 'green';
    if (status === 'maintenance') return 'yellow';
    return 'red';
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">Кластер_Серверов</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Распределённая сеть VPN-узлов</p>
        </div>
        <div className="flex gap-2">
          <CyberButton variant="outline" onClick={handleSync} disabled={syncMutation.isPending}>
            <ArrowDownUp className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Синхронизация...' : 'Синхронизировать'}
          </CyberButton>
          <CyberButton onClick={() => { setForm(defaultForm); setIsAddOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Добавить сервер
          </CyberButton>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Серверы</span>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{stats.totalServers}</p>
          </CyberCard>
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Онлайн</span>
            </div>
            <p className="text-2xl font-display font-bold text-green-400">{stats.onlineServers}</p>
          </CyberCard>
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Клиенты</span>
            </div>
            <p className="text-2xl font-display font-bold text-blue-400">{stats.totalClients}</p>
          </CyberCard>
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-yellow-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Средний пинг</span>
            </div>
            <p className="text-2xl font-display font-bold text-yellow-400">{stats.avgPing !== null && stats.avgPing !== undefined ? `${stats.avgPing} мс` : '—'}</p>
          </CyberCard>
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Трафик</span>
            </div>
            <p className="text-2xl font-display font-bold text-purple-400">{stats.totalBandwidth.toFixed(1)} ГБ</p>
          </CyberCard>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <CyberButton
          variant={activeTab === 'servers' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('servers')}
        >
          <Server className="w-4 h-4 mr-2" /> Серверы
        </CyberButton>
        <CyberButton
          variant={activeTab === 'failover' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('failover')}
        >
          <Link2 className="w-4 h-4 mr-2" /> Failover URL
        </CyberButton>
      </div>

      {activeTab === 'servers' && (
        <>
          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground font-mono text-sm">Загрузка кластера...</p>
            </div>
          ) : !servers?.length ? (
            <CyberCard>
              <div className="text-center py-12">
                <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-mono">Нет серверов в кластере</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Добавьте первый VPN-сервер</p>
              </div>
            </CyberCard>
          ) : (
            <div className="grid gap-4">
              {servers.map((srv) => (
                <CyberCard key={srv.id} className="relative overflow-hidden">
                  {srv.isPrimary && (
                    <div className="absolute top-0 right-0 bg-primary/20 border-l border-b border-primary px-3 py-1">
                      <span className="text-primary font-mono text-xs uppercase flex items-center gap-1">
                        <Star className="w-3 h-3" /> Основной
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {statusIcon(srv.status)}
                        <span className="text-lg font-display font-bold text-foreground uppercase tracking-wide">{srv.countryFlag} {srv.name}</span>
                        <CyberBadge variant={statusColor(srv.status)}>{srv.status}</CyberBadge>
                        {srv.syncUrl && <SyncStatusBadge status={srv.syncStatus || 'idle'} />}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 font-mono text-sm">
                        <div>
                          <span className="text-muted-foreground">Адрес:</span>{' '}
                          <span className="text-foreground">{srv.address}:{srv.port}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Страна:</span>{' '}
                          <span className="text-foreground">{srv.country}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Провайдер:</span>{' '}
                          <span className="text-foreground">{srv.provider || '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Пинг:</span>{' '}
                          <span className="text-foreground">{srv.lastPing !== null && srv.lastPing !== undefined ? `${srv.lastPing} мс` : '—'}</span>
                        </div>
                      </div>

                      {srv.syncUrl && (
                        <div className="font-mono text-xs text-muted-foreground mt-2">
                          <span>Sync URL: {srv.syncUrl}</span>
                          {srv.lastSyncAt && <span className="ml-4">Послед. синхр.: {new Date(srv.lastSyncAt).toLocaleString('ru-RU')}</span>}
                        </div>
                      )}

                      {(srv.cpuUsage !== null || srv.memUsage !== null) && (
                        <div className="flex gap-6 mt-3">
                          {srv.cpuUsage !== null && srv.cpuUsage !== undefined && (
                            <div className="flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-muted-foreground" />
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${srv.cpuUsage}%` }} />
                              </div>
                              <span className="font-mono text-xs text-muted-foreground">{srv.cpuUsage}%</span>
                            </div>
                          )}
                          {srv.memUsage !== null && srv.memUsage !== undefined && (
                            <div className="flex items-center gap-2">
                              <HardDrive className="w-4 h-4 text-muted-foreground" />
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 transition-all" style={{ width: `${srv.memUsage}%` }} />
                              </div>
                              <span className="font-mono text-xs text-muted-foreground">{srv.memUsage}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-4 mt-2 font-mono text-xs text-muted-foreground">
                        <span>Клиенты: {srv.connectedClients}/{srv.maxClients}</span>
                        <span>Трафик: {srv.bandwidthUsed.toFixed(1)}/{srv.bandwidthLimit || '∞'} ГБ</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap lg:flex-col gap-2 justify-end shrink-0">
                      <CyberTooltip text="Проверить соединение">
                        <CyberButton size="sm" variant="outline" onClick={() => handlePing(srv.id)} disabled={pinging === srv.id}>
                          <Activity className={`w-4 h-4 ${pinging === srv.id ? 'animate-pulse' : ''}`} />
                        </CyberButton>
                      </CyberTooltip>
                      {!srv.isPrimary && (
                        <CyberTooltip text="Назначить основным">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetPrimary(srv.id)}>
                            <Star className="w-4 h-4" />
                          </CyberButton>
                        </CyberTooltip>
                      )}
                      {srv.status === 'online' ? (
                        <CyberTooltip text="На обслуживание">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetStatus(srv.id, 'maintenance')}>
                            <Wrench className="w-4 h-4" />
                          </CyberButton>
                        </CyberTooltip>
                      ) : (
                        <CyberTooltip text="Активировать">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetStatus(srv.id, 'online')}>
                            <RefreshCw className="w-4 h-4" />
                          </CyberButton>
                        </CyberTooltip>
                      )}
                      <CyberTooltip text="Редактировать">
                        <CyberButton size="sm" variant="outline" onClick={() => openEdit(srv)}>
                          <Wrench className="w-4 h-4" />
                        </CyberButton>
                      </CyberTooltip>
                      <CyberTooltip text="Удалить сервер">
                        <CyberButton size="sm" variant="destructive" onClick={() => handleDelete(srv.id)}>
                          <Trash2 className="w-4 h-4" />
                        </CyberButton>
                      </CyberTooltip>
                    </div>
                  </div>
                </CyberCard>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'failover' && (
        <div className="space-y-4">
          <CyberCard>
            <div className="flex items-center gap-3 mb-4">
              <Link2 className="w-5 h-5 text-primary" />
              <span className="font-display font-bold text-foreground uppercase tracking-wide">Failover URL для пользователей</span>
            </div>
            <p className="text-muted-foreground font-mono text-sm mb-4">
              Комбинированные ссылки для автоматического переключения между серверами. Серверы отсортированы по доступности (онлайн + минимальный пинг).
            </p>

            {!failoverData?.users?.length ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-mono text-sm">Нет пользователей с профилями</p>
              </div>
            ) : (
              <div className="space-y-3">
                {failoverData.users.map((user) => (
                  <div key={user.userId} className="border border-border rounded-lg p-4 bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono font-bold text-foreground">{user.userName}</span>
                        <CyberBadge variant="muted">{user.urlCount} URL</CyberBadge>
                      </div>
                      <CyberTooltip text="Скопировать комбинированный URL">
                        <CyberButton
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyUrl(user.userId, user.combined)}
                        >
                          {copiedId === user.userId ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </CyberButton>
                      </CyberTooltip>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground break-all bg-background/50 rounded p-2 border border-border/50 max-h-20 overflow-y-auto">
                      {user.combined}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CyberCard>
        </div>
      )}

      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Добавить сервер">
        <form onSubmit={handleCreate} className="space-y-4">
          <CyberInput label="Название" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
          <CyberInput label="IP-адрес / Домен" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Порт" type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} />
            <CyberInput label="Макс. клиентов" type="number" value={form.maxClients} onChange={(e) => setForm(f => ({ ...f, maxClients: parseInt(e.target.value) || 100 }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Страна" value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
            <CyberInput label="Флаг (эмодзи)" value={form.countryFlag} onChange={(e) => setForm(f => ({ ...f, countryFlag: e.target.value }))} />
          </div>
          <CyberInput label="Провайдер" value={form.provider} onChange={(e) => setForm(f => ({ ...f, provider: e.target.value }))} />
          <div className="border-t border-border pt-4 mt-4">
            <p className="font-mono text-xs text-muted-foreground uppercase mb-3">Синхронизация кластера</p>
            <CyberInput label="Sync URL (опц.)" value={form.syncUrl} onChange={(e) => setForm(f => ({ ...f, syncUrl: e.target.value }))} placeholder="https://server2.example.com" />
            <div className="mt-3">
              <CyberInput label="Sync Secret (опц.)" value={form.syncSecret} onChange={(e) => setForm(f => ({ ...f, syncSecret: e.target.value }))} placeholder="HMAC shared secret" />
            </div>
          </div>
          <CyberButton type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Добавление...' : 'Добавить в кластер'}
          </CyberButton>
        </form>
      </Modal>

      <Modal open={editServer !== null} onClose={() => { setEditServer(null); setForm(defaultForm); }} title="Редактировать сервер">
        <form onSubmit={handleUpdate} className="space-y-4">
          <CyberInput label="Название" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
          <CyberInput label="IP-адрес / Домен" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Порт" type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} />
            <CyberInput label="Макс. клиентов" type="number" value={form.maxClients} onChange={(e) => setForm(f => ({ ...f, maxClients: parseInt(e.target.value) || 100 }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Страна" value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
            <CyberInput label="Флаг (эмодзи)" value={form.countryFlag} onChange={(e) => setForm(f => ({ ...f, countryFlag: e.target.value }))} />
          </div>
          <CyberInput label="Провайдер" value={form.provider} onChange={(e) => setForm(f => ({ ...f, provider: e.target.value }))} />
          <div className="border-t border-border pt-4 mt-4">
            <p className="font-mono text-xs text-muted-foreground uppercase mb-3">Синхронизация кластера</p>
            <CyberInput label="Sync URL (опц.)" value={form.syncUrl} onChange={(e) => setForm(f => ({ ...f, syncUrl: e.target.value }))} placeholder="https://server2.example.com" />
            <div className="mt-3">
              <CyberInput label="Sync Secret (опц.)" value={form.syncSecret} onChange={(e) => setForm(f => ({ ...f, syncSecret: e.target.value }))} placeholder="Оставьте пустым, чтобы не менять" />
            </div>
          </div>
          <CyberButton type="submit" className="w-full" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
          </CyberButton>
        </form>
      </Modal>
    </Layout>
  );
}
