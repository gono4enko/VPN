import React, { useState } from 'react';
import { Layout } from '@/components/layout';
import {
  useListServers, useCreateServer, useUpdateServer, useDeleteServer,
  useSetPrimaryServer, useGetClusterStats,
  useTriggerClusterSync, useGetFailoverUrls,
  getListServersQueryKey, getGetClusterStatsQueryKey, getGetFailoverUrlsQueryKey,
  pingServer,
  useListClusterNodes, useGetClusterConfig,
  getListClusterNodesQueryKey, getGetClusterConfigQueryKey,
  getGetClusterSyncStatusQueryKey,
  useGetClusterSyncStatus,
} from '@workspace/api-client-react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, Modal, CyberInput } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import {
  Plus, Trash2, Activity, Star, Server, Cpu, HardDrive,
  Users, Wifi, WifiOff, Wrench, RefreshCw, Globe, Link, Unlink,
  ArrowDownUp, Settings, Clock, CheckCircle, AlertCircle, XCircle,
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

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

interface NodeForm {
  name: string;
  address: string;
  port: number;
  apiPort: number;
  clusterSecret: string;
}

const defaultServerForm: ServerForm = {
  name: '', address: '', port: 443, country: '', countryFlag: '🌐', provider: '', maxClients: 100,
};

const defaultNodeForm: NodeForm = {
  name: '', address: '', port: 443, apiPort: 3000, clusterSecret: '',
};

type TabType = 'servers' | 'nodes' | 'config';

export default function ClusterPage() {
  const queryClient = useQueryClient();
  const { data: servers, isLoading: serversLoading } = useListServers({ query: { refetchInterval: 10000 } as never });
  const { data: stats } = useGetClusterStats({ query: { refetchInterval: 10000 } as never });
  const { data: nodes, isLoading: nodesLoading } = useListClusterNodes({ query: { refetchInterval: 10000 } as never });
  const { data: clusterConfig } = useGetClusterConfig({ query: { refetchInterval: 30000 } as never });
  const { data: syncStatus } = useGetClusterSyncStatus({ query: { refetchInterval: 10000 } as never });

  const [activeTab, setActiveTab] = useState<TabType>('servers');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editServer, setEditServer] = useState<number | null>(null);
  const [serverForm, setServerForm] = useState<ServerForm>(defaultServerForm);
  const [pinging, setPinging] = useState<number | null>(null);
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [nodeForm, setNodeForm] = useState<NodeForm>(defaultNodeForm);
  const [syncingNode, setSyncingNode] = useState<number | null>(null);
  const [pingingNode, setPingingNode] = useState<number | null>(null);

  const createMutation = useCreateServer();
  const updateMutation = useUpdateServer();
  const deleteMutation = useDeleteServer();
  const setPrimaryMutation = useSetPrimaryServer();
  const syncMutation = useTriggerClusterSync();

  const addNodeMutation = useMutation({
    mutationFn: async (data: NodeForm) => {
      return customFetch<unknown>('/api/cluster/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    },
  });

  const removeNodeMutation = useMutation({
    mutationFn: async (id: number) => {
      return customFetch<unknown>(`/api/cluster/nodes/${id}`, { method: 'DELETE' });
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetClusterStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListClusterNodesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetClusterConfigQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetClusterSyncStatusQueryKey() });
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ data: { ...serverForm, port: serverForm.port || 443, maxClients: serverForm.maxClients || 100 } });
    invalidateAll();
    setIsAddOpen(false);
    setServerForm(defaultServerForm);
  };

  const handleUpdateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editServer === null) return;
    await updateMutation.mutateAsync({ id: editServer, data: serverForm });
    invalidateAll();
    setEditServer(null);
    setServerForm(defaultServerForm);
  };

  const handleDeleteServer = async (id: number) => {
    if (confirm("Удалить этот сервер из кластера?")) {
      await deleteMutation.mutateAsync({ id });
      invalidateAll();
    }
  };

  const handlePingServer = async (id: number) => {
    setPinging(id);
    try {
      await pingServer(id);
      invalidateAll();
    } catch {}
    setPinging(null);
  };

  const handleSetPrimary = async (id: number) => {
    await setPrimaryMutation.mutateAsync({ id });
    invalidateAll();
  };

  const handleSetStatus = async (id: number, status: string) => {
    await updateMutation.mutateAsync({ id, data: { status } });
    invalidateAll();
  };

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    await addNodeMutation.mutateAsync(nodeForm);
    invalidateAll();
    setIsAddNodeOpen(false);
    setNodeForm(defaultNodeForm);
  };

  const handleRemoveNode = async (id: number) => {
    if (confirm("Удалить этот узел из кластера?")) {
      await removeNodeMutation.mutateAsync(id);
      invalidateAll();
    }
  };

  const handlePingNode = async (id: number) => {
    setPingingNode(id);
    try {
      await customFetch(`/api/cluster/nodes/${id}/ping`, { method: 'GET' });
      invalidateAll();
    } catch {}
    setPingingNode(null);
  };

  const handleSyncNode = async (id: number) => {
    setSyncingNode(id);
    try {
      await customFetch(`/api/cluster/nodes/${id}/sync`, { method: 'POST' });
      invalidateAll();
    } catch {}
    setSyncingNode(null);
  };

  const openEditServer = (srv: { id: number; name: string; address: string; port: number; country: string; countryFlag: string; provider: string; maxClients: number }) => {
    setServerForm({ name: srv.name, address: srv.address, port: srv.port, country: srv.country, countryFlag: srv.countryFlag, provider: srv.provider, maxClients: srv.maxClients });
    setEditServer(srv.id);
  };

  const statusIcon = (status: string) => {
    if (status === 'online') return <Wifi className="w-4 h-4 text-green-400" />;
    if (status === 'maintenance' || status === 'degraded') return <Wrench className="w-4 h-4 text-yellow-400" />;
    return <WifiOff className="w-4 h-4 text-red-400" />;
  };

  const statusColor = (status: string): "green" | "yellow" | "red" => {
    if (status === 'online') return 'green';
    if (status === 'maintenance' || status === 'degraded') return 'yellow';
    return 'red';
  };

  const syncStatusIcon = (status: string) => {
    if (status === 'synced') return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === 'pending') return <Clock className="w-4 h-4 text-yellow-400" />;
    return <AlertCircle className="w-4 h-4 text-red-400" />;
  };

  const formatTimeAgo = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}с назад`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}м назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}ч назад`;
    return `${Math.floor(diff / 86400000)}д назад`;
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">Кластер_Серверов</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Распределённая сеть VPN-узлов</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'servers' && (
            <CyberButton onClick={() => { setServerForm(defaultServerForm); setIsAddOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Добавить сервер
            </CyberButton>
          )}
          {activeTab === 'nodes' && (
            <CyberButton onClick={() => { setNodeForm(defaultNodeForm); setIsAddNodeOpen(true); }}>
              <Link className="w-4 h-4 mr-2" /> Добавить узел
            </CyberButton>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
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
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Узлы</span>
            </div>
            <p className="text-2xl font-display font-bold text-cyan-400">{stats.totalNodes}</p>
          </CyberCard>
          <CyberCard>
            <div className="flex items-center gap-2 mb-1">
              <Link className="w-4 h-4 text-teal-400" />
              <span className="font-mono text-xs text-muted-foreground uppercase">Узлы онлайн</span>
            </div>
            <p className="text-2xl font-display font-bold text-teal-400">{stats.onlineNodes}</p>
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

      {stats?.lastSyncAt && (
        <div className="mb-6">
          <CyberCard>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowDownUp className="w-5 h-5 text-primary" />
                <div>
                  <span className="font-mono text-sm text-muted-foreground">Последняя синхронизация:</span>
                  <span className="ml-2 font-mono text-sm text-foreground">{formatTimeAgo(stats.lastSyncAt)}</span>
                </div>
              </div>
              {clusterConfig && (
                <div className="flex items-center gap-2">
                  <CyberBadge variant={clusterConfig.clusterEnabled ? 'green' : 'red'}>
                    {clusterConfig.clusterEnabled ? 'Кластер активен' : 'Кластер выключен'}
                  </CyberBadge>
                  {clusterConfig.autoSync && <CyberBadge variant="green">Авто-синхр.</CyberBadge>}
                </div>
              )}
            </div>
          </CyberCard>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <CyberButton variant={activeTab === 'servers' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('servers')}>
          <Server className="w-4 h-4 mr-1" /> Серверы
        </CyberButton>
        <CyberButton variant={activeTab === 'nodes' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('nodes')}>
          <Globe className="w-4 h-4 mr-1" /> Узлы кластера
        </CyberButton>
        <CyberButton variant={activeTab === 'config' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('config')}>
          <Settings className="w-4 h-4 mr-1" /> Настройки
        </CyberButton>
      </div>

      {activeTab === 'servers' && (
        <>
          {serversLoading ? (
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
                      <div className="flex items-center gap-3 mb-2">
                        {statusIcon(srv.status)}
                        <span className="text-lg font-display font-bold text-foreground uppercase tracking-wide">{srv.countryFlag} {srv.name}</span>
                        <CyberBadge variant={statusColor(srv.status)}>{srv.status}</CyberBadge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 font-mono text-sm">
                        <div><span className="text-muted-foreground">Адрес:</span> <span className="text-foreground">{srv.address}:{srv.port}</span></div>
                        <div><span className="text-muted-foreground">Страна:</span> <span className="text-foreground">{srv.country}</span></div>
                        <div><span className="text-muted-foreground">Провайдер:</span> <span className="text-foreground">{srv.provider || '—'}</span></div>
                        <div><span className="text-muted-foreground">Пинг:</span> <span className="text-foreground">{srv.lastPing !== null && srv.lastPing !== undefined ? `${srv.lastPing} мс` : '—'}</span></div>
                      </div>
                      {(srv.cpuUsage !== null || srv.memUsage !== null) && (
                        <div className="flex gap-6 mt-3">
                          {srv.cpuUsage !== null && srv.cpuUsage !== undefined && (
                            <div className="flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-muted-foreground" />
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${srv.cpuUsage}%` }} /></div>
                              <span className="font-mono text-xs text-muted-foreground">{srv.cpuUsage}%</span>
                            </div>
                          )}
                          {srv.memUsage !== null && srv.memUsage !== undefined && (
                            <div className="flex items-center gap-2">
                              <HardDrive className="w-4 h-4 text-muted-foreground" />
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-400 transition-all" style={{ width: `${srv.memUsage}%` }} /></div>
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
                        <CyberButton size="sm" variant="outline" onClick={() => handlePingServer(srv.id)} disabled={pinging === srv.id}>
                          <Activity className={`w-4 h-4 ${pinging === srv.id ? 'animate-pulse' : ''}`} />
                        </CyberButton>
                      </CyberTooltip>
                      {!srv.isPrimary && (
                        <CyberTooltip text="Назначить основным">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetPrimary(srv.id)}><Star className="w-4 h-4" /></CyberButton>
                        </CyberTooltip>
                      )}
                      {srv.status === 'online' ? (
                        <CyberTooltip text="На обслуживание">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetStatus(srv.id, 'maintenance')}><Wrench className="w-4 h-4" /></CyberButton>
                        </CyberTooltip>
                      ) : (
                        <CyberTooltip text="Активировать">
                          <CyberButton size="sm" variant="outline" onClick={() => handleSetStatus(srv.id, 'online')}><RefreshCw className="w-4 h-4" /></CyberButton>
                        </CyberTooltip>
                      )}
                      <CyberTooltip text="Редактировать">
                        <CyberButton size="sm" variant="outline" onClick={() => openEditServer(srv)}><Wrench className="w-4 h-4" /></CyberButton>
                      </CyberTooltip>
                      <CyberTooltip text="Удалить сервер">
                        <CyberButton size="sm" variant="destructive" onClick={() => handleDeleteServer(srv.id)}><Trash2 className="w-4 h-4" /></CyberButton>
                      </CyberTooltip>
                    </div>
                  </div>
                </CyberCard>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'nodes' && (
        <>
          {nodesLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground font-mono text-sm">Загрузка узлов...</p>
            </div>
          ) : !nodes?.length ? (
            <CyberCard>
              <div className="text-center py-12">
                <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-mono">Нет узлов в кластере</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Добавьте пиринговый узел для распределённой работы</p>
              </div>
            </CyberCard>
          ) : (
            <div className="grid gap-4">
              {nodes.map((node) => (
                <CyberCard key={node.id} className="relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {statusIcon(node.status)}
                        <span className="text-lg font-display font-bold text-foreground uppercase tracking-wide">{node.name}</span>
                        <CyberBadge variant={statusColor(node.status)}>{node.status}</CyberBadge>
                        {syncStatusIcon(node.syncStatus)}
                        <CyberBadge variant={node.syncStatus === 'synced' ? 'green' : node.syncStatus === 'pending' ? 'yellow' : 'red'}>
                          {node.syncStatus === 'synced' ? 'Синхр.' : node.syncStatus === 'pending' ? 'Ожидание' : 'Ошибка'}
                        </CyberBadge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 font-mono text-sm">
                        <div><span className="text-muted-foreground">ID:</span> <span className="text-foreground font-mono text-xs">{node.nodeId}</span></div>
                        <div><span className="text-muted-foreground">Адрес:</span> <span className="text-foreground">{node.address}:{node.port}</span></div>
                        <div><span className="text-muted-foreground">API Порт:</span> <span className="text-foreground">{node.apiPort}</span></div>
                        <div><span className="text-muted-foreground">Пинг:</span> <span className="text-foreground">{node.latency !== null && node.latency !== undefined ? `${node.latency} мс` : '—'}</span></div>
                      </div>
                      <div className="flex gap-4 mt-2 font-mono text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Виден: {formatTimeAgo(node.lastSeen)}</span>
                        <span className="flex items-center gap-1"><ArrowDownUp className="w-3 h-3" /> Синхр.: {formatTimeAgo(node.lastSyncAt)}</span>
                        {node.failCount > 0 && <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Ошибки: {node.failCount}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap lg:flex-col gap-2 justify-end shrink-0">
                      <CyberTooltip text="Проверить соединение">
                        <CyberButton size="sm" variant="outline" onClick={() => handlePingNode(node.id)} disabled={pingingNode === node.id}>
                          <Activity className={`w-4 h-4 ${pingingNode === node.id ? 'animate-pulse' : ''}`} />
                        </CyberButton>
                      </CyberTooltip>
                      <CyberTooltip text="Синхронизировать">
                        <CyberButton size="sm" variant="outline" onClick={() => handleSyncNode(node.id)} disabled={syncingNode === node.id}>
                          <ArrowDownUp className={`w-4 h-4 ${syncingNode === node.id ? 'animate-spin' : ''}`} />
                        </CyberButton>
                      </CyberTooltip>
                      <CyberTooltip text="Удалить узел">
                        <CyberButton size="sm" variant="destructive" onClick={() => handleRemoveNode(node.id)}>
                          <Unlink className="w-4 h-4" />
                        </CyberButton>
                      </CyberTooltip>
                    </div>
                  </div>
                </CyberCard>
              ))}
            </div>
          )}

          {syncStatus && syncStatus.nodes && syncStatus.nodes.length > 0 && (
            <CyberCard className="mt-6">
              <h3 className="text-lg font-display font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
                <ArrowDownUp className="w-5 h-5 text-primary" /> Статус синхронизации
              </h3>
              <div className="font-mono text-sm mb-3">
                <span className="text-muted-foreground">Локальный ID:</span> <span className="text-foreground">{syncStatus.localNodeId}</span>
                <span className="ml-4 text-muted-foreground">Ожидающих изменений:</span> <span className="text-foreground">{syncStatus.totalPendingChanges}</span>
              </div>
              <div className="space-y-2">
                {syncStatus.nodes.map((ns, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-t border-border/30">
                    <div className="flex items-center gap-3">
                      {statusIcon(ns.status)}
                      <span className="font-mono text-sm text-foreground">{ns.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{ns.nodeId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {syncStatusIcon(ns.syncStatus)}
                      <span className="font-mono text-xs text-muted-foreground">
                        {ns.pendingChanges > 0 ? `${ns.pendingChanges} изменений` : 'Актуально'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CyberCard>
          )}
        </>
      )}

      {activeTab === 'config' && clusterConfig && (
        <div className="grid gap-4 md:grid-cols-2">
          <CyberCard>
            <h3 className="text-lg font-display font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Конфигурация кластера
            </h3>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">ID узла</span>
                <span className="text-foreground">{clusterConfig.localNodeId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Имя узла</span>
                <span className="text-foreground">{clusterConfig.localNodeName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Кластер</span>
                <CyberBadge variant={clusterConfig.clusterEnabled ? 'green' : 'red'}>
                  {clusterConfig.clusterEnabled ? 'Включён' : 'Выключен'}
                </CyberBadge>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Авто-синхронизация</span>
                <CyberBadge variant={clusterConfig.autoSync ? 'green' : 'yellow'}>
                  {clusterConfig.autoSync ? 'Да' : 'Нет'}
                </CyberBadge>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Интервал синхр.</span>
                <span className="text-foreground">{clusterConfig.syncIntervalSeconds}с</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Интервал heartbeat</span>
                <span className="text-foreground">{clusterConfig.heartbeatIntervalSeconds}с</span>
              </div>
            </div>
          </CyberCard>
          <CyberCard>
            <h3 className="text-lg font-display font-bold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" /> Информация о кластере
            </h3>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Серверов</span>
                <span className="text-foreground">{stats?.totalServers || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Узлов</span>
                <span className="text-foreground">{stats?.totalNodes || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Онлайн узлов</span>
                <span className="text-green-400">{stats?.onlineNodes || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Всего клиентов</span>
                <span className="text-foreground">{stats?.totalClients || 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Посл. синхронизация</span>
                <span className="text-foreground">{formatTimeAgo(stats?.lastSyncAt)}</span>
              </div>
            </div>
          </CyberCard>
        </div>
      )}

      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Добавить сервер">
        <form onSubmit={handleCreateServer} className="space-y-4">
          <CyberInput label="Название" value={serverForm.name} onChange={(e) => setServerForm(f => ({ ...f, name: e.target.value }))} required />
          <CyberInput label="IP-адрес / Домен" value={serverForm.address} onChange={(e) => setServerForm(f => ({ ...f, address: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Порт" type="number" value={serverForm.port} onChange={(e) => setServerForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} />
            <CyberInput label="Макс. клиентов" type="number" value={serverForm.maxClients} onChange={(e) => setServerForm(f => ({ ...f, maxClients: parseInt(e.target.value) || 100 }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Страна" value={serverForm.country} onChange={(e) => setServerForm(f => ({ ...f, country: e.target.value }))} />
            <CyberInput label="Флаг (эмодзи)" value={serverForm.countryFlag} onChange={(e) => setServerForm(f => ({ ...f, countryFlag: e.target.value }))} />
          </div>
          <CyberInput label="Провайдер" value={serverForm.provider} onChange={(e) => setServerForm(f => ({ ...f, provider: e.target.value }))} />
          <CyberButton type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Добавление...' : 'Добавить в кластер'}
          </CyberButton>
        </form>
      </Modal>

      <Modal open={editServer !== null} onClose={() => { setEditServer(null); setServerForm(defaultServerForm); }} title="Редактировать сервер">
        <form onSubmit={handleUpdateServer} className="space-y-4">
          <CyberInput label="Название" value={serverForm.name} onChange={(e) => setServerForm(f => ({ ...f, name: e.target.value }))} required />
          <CyberInput label="IP-адрес / Домен" value={serverForm.address} onChange={(e) => setServerForm(f => ({ ...f, address: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Порт" type="number" value={serverForm.port} onChange={(e) => setServerForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} />
            <CyberInput label="Макс. клиентов" type="number" value={serverForm.maxClients} onChange={(e) => setServerForm(f => ({ ...f, maxClients: parseInt(e.target.value) || 100 }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="Страна" value={serverForm.country} onChange={(e) => setServerForm(f => ({ ...f, country: e.target.value }))} />
            <CyberInput label="Флаг (эмодзи)" value={serverForm.countryFlag} onChange={(e) => setServerForm(f => ({ ...f, countryFlag: e.target.value }))} />
          </div>
          <CyberInput label="Провайдер" value={serverForm.provider} onChange={(e) => setServerForm(f => ({ ...f, provider: e.target.value }))} />
          <CyberButton type="submit" className="w-full" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
          </CyberButton>
        </form>
      </Modal>

      <Modal open={isAddNodeOpen} onClose={() => setIsAddNodeOpen(false)} title="Добавить узел кластера">
        <form onSubmit={handleAddNode} className="space-y-4">
          <CyberInput label="Название узла" value={nodeForm.name} onChange={(e) => setNodeForm(f => ({ ...f, name: e.target.value }))} required />
          <CyberInput label="Адрес (IP / Домен)" value={nodeForm.address} onChange={(e) => setNodeForm(f => ({ ...f, address: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-4">
            <CyberInput label="VPN Порт" type="number" value={nodeForm.port} onChange={(e) => setNodeForm(f => ({ ...f, port: parseInt(e.target.value) || 443 }))} />
            <CyberInput label="API Порт" type="number" value={nodeForm.apiPort} onChange={(e) => setNodeForm(f => ({ ...f, apiPort: parseInt(e.target.value) || 3000 }))} />
          </div>
          <CyberInput label="Общий секрет кластера" type="password" value={nodeForm.clusterSecret} onChange={(e) => setNodeForm(f => ({ ...f, clusterSecret: e.target.value }))} required />
          <p className="text-xs text-muted-foreground font-mono">Секрет используется для HMAC-аутентификации между узлами. Все узлы в кластере должны использовать одинаковый секрет.</p>
          <CyberButton type="submit" className="w-full" disabled={addNodeMutation.isPending}>
            {addNodeMutation.isPending ? 'Добавление...' : 'Добавить узел'}
          </CyberButton>
        </form>
      </Modal>
    </Layout>
  );
}
