import React, { useState } from 'react';
import { Layout } from '@/components/layout';
import { 
  useListProfiles, useCreateProfile, useImportProfileUrl, useImportProfileSub,
  useDeleteProfile, useActivateProfile, usePingProfile,
  getListProfilesQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, Modal, CyberInput } from '@/components/ui/cyber';
import { Plus, Trash2, Power, Activity, QrCode, Link as LinkIcon, Rss, Keyboard } from 'lucide-react';
import { QrScanner } from '@/components/qr-scanner';

export default function ProfilesPage() {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading } = useListProfiles();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [importTab, setImportTab] = useState<'url' | 'sub' | 'qr' | 'manual'>('url');
  
  // Forms
  const [url, setUrl] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [manualForm, setManualForm] = useState({ name: '', protocol: 'vless', address: '', port: 443 });

  // Mutations
  const createMutation = useCreateProfile();
  const importUrlMutation = useImportProfileUrl();
  const importSubMutation = useImportProfileSub();
  const deleteMutation = useDeleteProfile();
  const activateMutation = useActivateProfile();
  const pingMutation = usePingProfile(0);

  const handleImportUrl = async (e?: React.FormEvent, customUrl?: string) => {
    e?.preventDefault();
    const targetUrl = customUrl || url;
    if (!targetUrl) return;
    await importUrlMutation.mutateAsync({ data: { url: targetUrl } });
    queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    setIsAddOpen(false);
    setUrl('');
  };

  const handleImportSub = async (e: React.FormEvent) => {
    e.preventDefault();
    await importSubMutation.mutateAsync({ data: { subscriptionUrl: subUrl } });
    queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    setIsAddOpen(false);
    setSubUrl('');
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ data: manualForm });
    queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    setIsAddOpen(false);
  };

  const handleActivate = async (id: number) => {
    await activateMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
  };

  const handleDelete = async (id: number) => {
    if(confirm("Erase this network node?")) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    }
  };

  const handlePing = async (id: number) => {
    try {
      const token = localStorage.getItem('vpn_token');
      const res = await fetch(`/api/profiles/${id}/ping`, { headers: { Authorization: `Bearer ${token}` } });
      if(res.ok) {
        queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
      }
    } catch (e) {}
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">Outbound_Nodes</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">External routing matrices</p>
        </div>
        <CyberButton onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4" />
          Inject Node
        </CyberButton>
      </div>

      {isLoading ? (
        <div className="text-primary font-mono animate-pulse">Scanning topology...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {profiles?.map((profile) => (
            <CyberCard key={profile.id} className={`p-5 flex flex-col justify-between ${profile.isActive ? 'border-primary shadow-[0_0_20px_rgba(0,212,170,0.2)]' : 'border-primary/20'}`}>
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{profile.countryFlag}</span>
                    <h3 className="font-display font-bold text-lg text-foreground tracking-wider uppercase truncate max-w-[150px]">{profile.name}</h3>
                  </div>
                  <CyberBadge variant={profile.isActive ? 'default' : 'muted'}>
                    {profile.isActive ? 'ACTIVE' : 'STANDBY'}
                  </CyberBadge>
                </div>
                
                <div className="space-y-2 mb-6 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protocol:</span>
                    <span className="text-primary">{profile.protocol.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Endpoint:</span>
                    <span className="text-foreground truncate ml-4">{profile.address}:{profile.port}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Latency:</span>
                    <div className="flex items-center gap-2">
                      <span className={profile.lastPing && profile.lastPing < 150 ? 'text-primary' : 'text-yellow-500'}>
                        {profile.lastPing ? `${profile.lastPing}ms` : 'Unknown'}
                      </span>
                      <button onClick={() => handlePing(profile.id)} className="text-muted-foreground hover:text-primary">
                        <Activity className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-primary/20">
                {!profile.isActive && (
                  <CyberButton onClick={() => handleActivate(profile.id)} className="flex-1 text-xs px-2">
                    <Power className="w-3 h-3" /> Connect
                  </CyberButton>
                )}
                <CyberButton onClick={() => handleDelete(profile.id)} variant="destructive" className={`${profile.isActive ? 'w-full' : 'w-auto px-3'}`}>
                  <Trash2 className="w-4 h-4" />
                </CyberButton>
              </div>
            </CyberCard>
          ))}
        </div>
      )}

      {/* Add Profile Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Data Injection Protocol" className="max-w-2xl">
        <div className="flex mb-6 border-b border-primary/30">
          <button onClick={() => setImportTab('url')} className={`px-4 py-2 font-display uppercase tracking-wider ${importTab === 'url' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}><LinkIcon className="w-4 h-4 inline mr-2"/> URL</button>
          <button onClick={() => setImportTab('sub')} className={`px-4 py-2 font-display uppercase tracking-wider ${importTab === 'sub' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}><Rss className="w-4 h-4 inline mr-2"/> Sub</button>
          <button onClick={() => setImportTab('qr')} className={`px-4 py-2 font-display uppercase tracking-wider ${importTab === 'qr' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}><QrCode className="w-4 h-4 inline mr-2"/> Scan</button>
          <button onClick={() => setImportTab('manual')} className={`px-4 py-2 font-display uppercase tracking-wider ${importTab === 'manual' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}><Keyboard className="w-4 h-4 inline mr-2"/> Manual</button>
        </div>

        {importTab === 'url' && (
          <form onSubmit={handleImportUrl} className="space-y-4">
            <CyberInput placeholder="vless://..." value={url} onChange={e => setUrl(e.target.value)} required />
            <CyberButton type="submit" className="w-full" disabled={importUrlMutation.isPending}>Execute Import</CyberButton>
          </form>
        )}

        {importTab === 'sub' && (
          <form onSubmit={handleImportSub} className="space-y-4">
            <CyberInput placeholder="https://.../sub" value={subUrl} onChange={e => setSubUrl(e.target.value)} required />
            <CyberButton type="submit" className="w-full" disabled={importSubMutation.isPending}>Sync Subfeed</CyberButton>
          </form>
        )}

        {importTab === 'qr' && (
          <div className="space-y-4">
            <p className="text-xs font-mono text-muted-foreground text-center">Awaiting visual data stream...</p>
            <QrScanner onScan={(text) => handleImportUrl(undefined, text)} />
          </div>
        )}

        {importTab === 'manual' && (
          <form onSubmit={handleManualCreate} className="space-y-4 grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Alias</label>
              <CyberInput value={manualForm.name} onChange={e => setManualForm({...manualForm, name: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Address</label>
              <CyberInput value={manualForm.address} onChange={e => setManualForm({...manualForm, address: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Port</label>
              <CyberInput type="number" value={manualForm.port} onChange={e => setManualForm({...manualForm, port: Number(e.target.value)})} required />
            </div>
            <div className="col-span-2">
              <CyberButton type="submit" className="w-full mt-2" disabled={createMutation.isPending}>Compile Node</CyberButton>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  );
}
