import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import { 
  useGetServerStatus, 
  useGetTrafficStats, 
  useAutoSelectProfile, 
  useRestartServer,
  useGetMonitoringStatus,
  getGetServerStatusQueryKey,
  getGetMonitoringStatusQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import { Activity, Zap, Users, Shield, RefreshCw, Server, Wifi, Radio } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: status, isLoading: statusLoading } = useGetServerStatus({ query: { refetchInterval: 5000 } as never });
  const { data: traffic, isLoading: trafficLoading } = useGetTrafficStats({ query: { refetchInterval: 10000 } as never });
  const { data: monitoringStatus } = useGetMonitoringStatus({ query: { refetchInterval: 5000 } as never });
  
  const autoSelectMutation = useAutoSelectProfile();
  const restartMutation = useRestartServer();

  const [clientIp, setClientIp] = useState<string | null>(null);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
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

        <CyberTooltip text="Состояние фонового мониторинга узлов">
          <CyberCard className="flex items-center p-6">
            <div className={`p-3 border rounded-sm mr-4 ${monitoringStatus?.isRunning ? 'bg-primary/10 border-primary/30' : 'bg-muted/10 border-muted/30'}`}>
              <Radio className={`w-6 h-6 ${monitoringStatus?.isRunning ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Монитор</p>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold font-display ${monitoringStatus?.isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                  {monitoringStatus?.isRunning ? 'ВКЛ' : 'ВЫКЛ'}
                </span>
                {monitoringStatus?.isRunning && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_#00d4aa]"></span>
                )}
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
