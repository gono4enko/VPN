import React from 'react';
import { Layout } from '@/components/layout';
import { useAuth } from '@/lib/auth';
import { useGetServerConfig, useRestartServer, getGetServerStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberInput } from '@/components/ui/cyber';
import { Settings2, RefreshCw, Cpu, Network } from 'lucide-react';

export default function SettingsPage() {
  const { authOpts } = useAuth();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetServerConfig(authOpts);
  const restartMutation = useRestartServer(authOpts);

  const handleRestart = async () => {
    if(confirm("Initiate cold reboot of Xray core? Connections will drop temporarily.")) {
      await restartMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
      alert("Restart signal dispatched.");
    }
  };

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-primary" /> System_Config
        </h2>
        <p className="text-muted-foreground font-mono text-sm mt-1">Core environment parameters</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CyberCard className="p-6">
          <h3 className="text-xl font-display uppercase font-bold text-primary mb-6 flex items-center gap-2 border-b border-primary/20 pb-4">
            <Network className="w-5 h-5" /> Ingress Matrix (Read-Only)
          </h3>
          
          {isLoading ? (
            <div className="animate-pulse text-primary font-mono">Decrypting config...</div>
          ) : (
            <div className="space-y-4 font-mono text-sm">
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">Office IP</label>
                <CyberInput readOnly value={config?.officeIp || ''} className="opacity-70 bg-transparent" />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">Office Port</label>
                <CyberInput readOnly value={config?.officePort || ''} className="opacity-70 bg-transparent" />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">SNI Mask</label>
                <CyberInput readOnly value={config?.officeSni || ''} className="opacity-70 bg-transparent" />
              </div>
            </div>
          )}
        </CyberCard>

        <div className="space-y-8">
          <CyberCard className="p-6">
            <h3 className="text-xl font-display uppercase font-bold text-accent mb-6 flex items-center gap-2 border-b border-accent/20 pb-4">
              <Cpu className="w-5 h-5" /> Automation Logic
            </h3>
            
            {isLoading ? (
              <div className="animate-pulse text-accent font-mono">Decrypting config...</div>
            ) : (
              <div className="space-y-4 font-mono text-sm">
                <div className="flex items-center justify-between p-3 bg-background/50 border border-primary/20">
                  <span className="text-foreground">Auto-Switch Engine</span>
                  <span className={`px-2 py-1 text-xs border ${config?.autoSwitch ? 'text-primary border-primary bg-primary/10' : 'text-muted-foreground border-muted-foreground'}`}>
                    {config?.autoSwitch ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground p-3 border-b border-primary/10">
                  <span>Evaluation Interval</span>
                  <span className="text-foreground">{config?.autoSwitchInterval} ms</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground p-3">
                  <span>Latency Threshold</span>
                  <span className="text-foreground">{config?.autoSwitchThreshold} ms</span>
                </div>
                <p className="text-xs text-muted-foreground/50 mt-4 italic">
                  // Parameters are locked by environment variables on the host container.
                </p>
              </div>
            )}
          </CyberCard>

          <CyberCard className="p-6 border-destructive/30">
            <h3 className="text-xl font-display uppercase font-bold text-destructive mb-4">Critical Directives</h3>
            <p className="text-muted-foreground font-mono text-sm mb-6">Executes a hard restart on the Xray binary. Active traffic will be interrupted.</p>
            <CyberButton variant="destructive" className="w-full" onClick={handleRestart} disabled={restartMutation.isPending}>
              <RefreshCw className={`w-4 h-4 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
              {restartMutation.isPending ? 'Executing...' : 'Force Reboot Core'}
            </CyberButton>
          </CyberCard>
        </div>
      </div>
    </Layout>
  );
}
