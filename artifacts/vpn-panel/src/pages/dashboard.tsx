import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import { 
  useGetServerStatus, 
  useGetTrafficStats, 
  useAutoSelectProfile, 
  useRestartServer,
  useGetMonitoringSettings,
  useStartMonitoring,
  useStopMonitoring,
  useCheckNow,
  useUpdateMonitoringSettings,
  useGetMonitoringEvents,
  getGetServerStatusQueryKey,
  getGetMonitoringSettingsQueryKey,
  getGetMonitoringEventsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, CyberInput } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import { Activity, Zap, Users, Shield, RefreshCw, Server, Wifi, Eye, EyeOff, Play, Square, Clock, ArrowRightLeft } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: status, isLoading: statusLoading } = useGetServerStatus({ query: { refetchInterval: 5000 } as never });
  const { data: traffic, isLoading: trafficLoading } = useGetTrafficStats({ query: { refetchInterval: 10000 } as never });
  const { data: monitoring } = useGetMonitoringSettings({ query: { refetchInterval: 3000 } as never });
  const { data: events } = useGetMonitoringEvents({ query: { refetchInterval: 5000 } as never });
  
  const autoSelectMutation = useAutoSelectProfile();
  const restartMutation = useRestartServer();
  const startMonMutation = useStartMonitoring();
  const stopMonMutation = useStopMonitoring();
  const checkNowMutation = useCheckNow();
  const updateSettingsMutation = useUpdateMonitoringSettings();

  const [clientIp, setClientIp] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/server/client-ip`.replace(/\/+/g, '/').replace(':/', '://'))
      .then(r => r.json())
      .then(d => setClientIp(d.ip))
      .catch(() => setClientIp(null));
  }, []);

  const handleAutoSelect = async () => {
    try {
      await autoSelectMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
    } catch {
      alert('Нет доступных профилей. Сначала добавьте профиль на странице "Профили".');
    }
  };

  const handleRestart = async () => {
    await restartMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
  };

  const invalidateMonitoring = () => {
    queryClient.invalidateQueries({ queryKey: getGetMonitoringSettingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMonitoringEventsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
  };

  const handleToggleMonitoring = async () => {
    if (monitoring?.isRunning) {
      await stopMonMutation.mutateAsync();
    } else {
      await startMonMutation.mutateAsync();
    }
    invalidateMonitoring();
  };

  const handleCheckNow = async () => {
    await checkNowMutation.mutateAsync();
    invalidateMonitoring();
  };

  const handleSaveSettings = async () => {
    const data: Record<string, unknown> = {};
    if (editInterval !== null) data.intervalSeconds = editInterval;
    if (editThreshold !== null) data.pingThresholdMs = editThreshold;
    await updateSettingsMutation.mutateAsync({ data: data as never });
    setEditInterval(null);
    setEditThreshold(null);
    invalidateMonitoring();
  };

  const handleToggleAutoSwitch = async () => {
    await updateSettingsMutation.mutateAsync({ data: { autoSwitch: !monitoring?.autoSwitch } as never });
    invalidateMonitoring();
  };

  const chartData = traffic?.points.map(p => ({
    time: format(new Date(p.time), 'HH:mm'),
    Входящий: Number((p.inbound / 1024 / 1024).toFixed(2)),
    Исходящий: Number((p.outbound / 1024 / 1024).toFixed(2)),
  })) || [];

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">Сеть_Ядро</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Телеметрия системы и текущий статус</p>
        </div>
        <div className="flex gap-3">
          <CyberTooltip text="Перезапустить ядро Xray. Активные подключения будут прерваны">
            <CyberButton onClick={handleRestart} disabled={restartMutation.isPending} variant="outline">
              <RefreshCw className={`w-4 h-4 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
              Перезапуск
            </CyberButton>
          </CyberTooltip>
          <CyberTooltip text="Автоматически выбрать профиль с наименьшей задержкой">
            <CyberButton onClick={handleAutoSelect} disabled={autoSelectMutation.isPending}>
              <Zap className="w-4 h-4" />
              {autoSelectMutation.isPending ? 'Оптимизация...' : 'Быстрый маршрут'}
            </CyberButton>
          </CyberTooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <CyberTooltip text="Текущее состояние сервера Xray">
          <CyberCard className="flex items-center p-6">
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-sm mr-4">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Статус</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-display">
                  {statusLoading ? '...' : (status?.running ? 'ОНЛАЙН' : 'ОФЛАЙН')}
                </span>
                {status?.running && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_#00d4aa]"></span>
                )}
              </div>
            </div>
          </CyberCard>
        </CyberTooltip>

        <CyberTooltip text="Текущий активный исходящий профиль маршрутизации">
          <CyberCard className="flex items-center p-6">
            <div className="p-3 bg-accent/10 border border-accent/30 rounded-sm mr-4">
              <Shield className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Маршрут</p>
              <span className="text-xl font-bold font-display text-accent truncate max-w-[150px] inline-block">
                {statusLoading ? '...' : (status?.activeOutbound || 'ПРЯМОЙ')}
              </span>
            </div>
          </CyberCard>
        </CyberTooltip>

        <CyberTooltip text="Количество активных VPN-клиентов">
          <CyberCard className="flex items-center p-6">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-sm mr-4">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Подключено</p>
              <span className="text-xl font-bold font-display text-blue-500">
                {statusLoading ? '...' : status?.connectedClients}
              </span>
            </div>
          </CyberCard>
        </CyberTooltip>

        <CyberTooltip text="Задержка до активного узла (мс)">
          <CyberCard className="flex items-center p-6">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-sm mr-4">
              <Server className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Пинг</p>
              <div className="flex items-end gap-1">
                <span className="text-xl font-bold font-display text-yellow-500">
                  {statusLoading ? '...' : (status?.currentPing || '--')}
                </span>
                <span className="text-xs font-mono text-yellow-500/70 mb-1">мс</span>
              </div>
            </div>
          </CyberCard>
        </CyberTooltip>
      </div>

      {clientIp && (
        <CyberCard className="p-4 mb-8 flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-sm">
            <Wifi className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Ваш IP-адрес</p>
            <span className="text-xl font-bold font-display text-cyan-500">{clientIp}</span>
          </div>
        </CyberCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <CyberCard className="p-6 lg:col-span-1">
          <h3 className="text-lg font-display uppercase tracking-widest font-bold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" /> Мониторинг
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-muted-foreground">Статус</span>
              <CyberBadge variant={monitoring?.isRunning ? 'green' : 'red'}>
                {monitoring?.isRunning ? 'Работает' : 'Остановлен'}
              </CyberBadge>
            </div>

            <div className="flex gap-2">
              <CyberButton
                size="sm"
                variant={monitoring?.isRunning ? 'destructive' : 'default'}
                onClick={handleToggleMonitoring}
                className="flex-1"
                disabled={startMonMutation.isPending || stopMonMutation.isPending}
              >
                {monitoring?.isRunning ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                {monitoring?.isRunning ? 'Стоп' : 'Старт'}
              </CyberButton>
              <CyberTooltip text="Запустить проверку всех узлов прямо сейчас">
                <CyberButton size="sm" variant="outline" onClick={handleCheckNow} disabled={checkNowMutation.isPending}>
                  <RefreshCw className={`w-4 h-4 ${checkNowMutation.isPending ? 'animate-spin' : ''}`} />
                </CyberButton>
              </CyberTooltip>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-muted-foreground">Авто-переключение</span>
              <CyberButton size="sm" variant="outline" onClick={handleToggleAutoSwitch}>
                {monitoring?.autoSwitch ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-red-400" />}
              </CyberButton>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Интервал (сек)</span>
                <div className="flex items-center gap-2">
                  <CyberInput
                    type="number"
                    className="w-20 text-xs"
                    value={editInterval ?? monitoring?.intervalSeconds ?? 60}
                    onChange={(e) => setEditInterval(parseInt(e.target.value) || 60)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Порог (мс)</span>
                <div className="flex items-center gap-2">
                  <CyberInput
                    type="number"
                    className="w-20 text-xs"
                    value={editThreshold ?? monitoring?.pingThresholdMs ?? 500}
                    onChange={(e) => setEditThreshold(parseInt(e.target.value) || 500)}
                  />
                </div>
              </div>
              {(editInterval !== null || editThreshold !== null) && (
                <CyberButton size="sm" className="w-full" onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
                  Сохранить
                </CyberButton>
              )}
            </div>

            {monitoring?.lastCheckAt && (
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Clock className="w-3 h-3" />
                Последняя: {format(new Date(monitoring.lastCheckAt), 'HH:mm:ss')}
              </div>
            )}
          </div>
        </CyberCard>

        <CyberCard className="p-6 lg:col-span-2">
          <h3 className="text-lg font-display uppercase tracking-widest font-bold mb-4 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-accent" /> Лог_Переключений
          </h3>

          {!events?.length ? (
            <p className="text-muted-foreground font-mono text-sm">Нет событий авто-переключения</p>
          ) : (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {events.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 bg-background/50 border border-primary/10 text-sm font-mono">
                  <ArrowRightLeft className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {event.fromProfileName && (
                        <>
                          <span className="text-red-400">{event.fromProfileName}</span>
                          <span className="text-muted-foreground">→</span>
                        </>
                      )}
                      <span className="text-green-400">{event.toProfileName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{event.reason}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground/70 mt-1">
                      {event.pingBefore !== null && event.pingBefore !== undefined && <span>Было: {event.pingBefore}мс</span>}
                      {event.pingAfter !== null && event.pingAfter !== undefined && <span>Стало: {event.pingAfter}мс</span>}
                      <span>{format(new Date(event.createdAt), 'dd.MM HH:mm:ss')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CyberCard>
      </div>

      <CyberCard className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-display uppercase tracking-widest font-bold">Поток_Трафика</h3>
            <p className="text-xs font-mono text-muted-foreground">Последние 24 часа (МБ)</p>
          </div>
          <div className="flex gap-4 font-mono text-xs">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 bg-primary/20 border border-primary"></div>
               <span className="text-primary">Вх: {((traffic?.totalIn || 0)/1024/1024).toFixed(1)}М</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 bg-accent/20 border border-accent"></div>
               <span className="text-accent">Исх: {((traffic?.totalOut || 0)/1024/1024).toFixed(1)}М</span>
             </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          {trafficLoading ? (
            <div className="w-full h-full flex items-center justify-center font-mono text-primary animate-pulse">Загрузка телеметрии...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(168 100% 41%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(168 100% 41%)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(280 100% 60%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(280 100% 60%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsla(168, 100%, 41%, 0.1)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(225 20% 60%)" 
                  fontSize={10} 
                  fontFamily="'JetBrains Mono', monospace"
                  tickLine={false}
                />
                <YAxis 
                  stroke="hsl(225 20% 60%)" 
                  fontSize={10} 
                  fontFamily="'JetBrains Mono', monospace"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(225 40% 11%)', borderColor: 'hsla(168, 100%, 41%, 0.3)', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="Входящий" stroke="hsl(168 100% 41%)" fillOpacity={1} fill="url(#colorIn)" />
                <Area type="monotone" dataKey="Исходящий" stroke="hsl(280 100% 60%)" fillOpacity={1} fill="url(#colorOut)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CyberCard>
    </Layout>
  );
}
