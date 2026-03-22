import React, { useState } from 'react';
import { Layout } from '@/components/layout';
import { useAuth } from '@/lib/auth';
import { 
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser, 
  useBlockUser, useUnblockUser, useGetUserQr, useGetUserVlessUrl,
  getListUsersQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, Modal, CyberInput } from '@/components/ui/cyber';
import { Plus, Eye, EyeOff, Edit, Trash2, Ban, CheckCircle, QrCode, Copy } from 'lucide-react';
import { format } from 'date-fns';

export default function UsersPage() {
  const { authOpts } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers(authOpts);
  
  const [showUuid, setShowUuid] = useState<Record<number, boolean>>({});
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState<any>(null);
  const [activeQrUser, setActiveQrUser] = useState<number | null>(null);

  // Form states
  const [formData, setFormData] = useState({ name: '', trafficLimit: 0, expiresAt: '' });

  // Mutations
  const createMutation = useCreateUser(authOpts);
  const updateMutation = useUpdateUser(authOpts);
  const deleteMutation = useDeleteUser(authOpts);
  const blockMutation = useBlockUser(authOpts);
  const unblockMutation = useUnblockUser(authOpts);

  const { data: qrData } = useGetUserQr(activeQrUser || 0, { ...authOpts, query: { enabled: !!activeQrUser } });

  const toggleUuid = (id: number) => setShowUuid(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ 
      data: { 
        name: formData.name, 
        trafficLimit: Number(formData.trafficLimit),
        expiresAt: formData.expiresAt || null
      } 
    });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    setIsAddOpen(false);
    setFormData({ name: '', trafficLimit: 0, expiresAt: '' });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    await updateMutation.mutateAsync({ 
      id: editingUser.id, 
      data: { 
        name: formData.name, 
        trafficLimit: Number(formData.trafficLimit),
        expiresAt: formData.expiresAt || null
      } 
    });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    setIsEditOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Execute deletion protocol for this user?")) {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    }
  };

  const toggleBlock = async (user: any) => {
    if (user.status === 'active') {
      await blockMutation.mutateAsync({ id: user.id });
    } else {
      await unblockMutation.mutateAsync({ id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    setFormData({ 
      name: user.name, 
      trafficLimit: user.trafficLimit, 
      expiresAt: user.expiresAt ? new Date(user.expiresAt).toISOString().split('T')[0] : '' 
    });
    setIsEditOpen(true);
  };

  const openQr = (id: number) => {
    setActiveQrUser(id);
    setIsQrOpen(true);
  };

  const copyUrl = async (id: number) => {
    // We need to fetch it first since it's not in the list response
    try {
      const token = localStorage.getItem('vpn_token');
      const res = await fetch(`/api/users/${id}/vless-url`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      navigator.clipboard.writeText(data.vlessUrl);
      alert("VLESS URL copied to clipboard");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">User_Matrix</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Manage client access credentials</p>
        </div>
        <CyberButton onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4" />
          Provision User
        </CyberButton>
      </div>

      <CyberCard className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-primary/20 bg-primary/5 font-display tracking-widest text-primary uppercase text-sm">
              <th className="p-4">Alias</th>
              <th className="p-4">UUID</th>
              <th className="p-4">Data Usage</th>
              <th className="p-4">Status</th>
              <th className="p-4">Expiry</th>
              <th className="p-4 text-right">Directives</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-primary animate-pulse">Scanning matrix...</td></tr>
            ) : users?.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No users provisioned.</td></tr>
            ) : (
              users?.map((user) => (
                <tr key={user.id} className="border-b border-primary/10 hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-foreground">{user.name}</td>
                  <td className="p-4 flex items-center gap-2 text-muted-foreground">
                    {showUuid[user.id] ? user.uuid : '••••••••-••••-••••-••••-••••••••••••'}
                    <button onClick={() => toggleUuid(user.id)} className="text-primary/50 hover:text-primary">
                      {showUuid[user.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="p-4">
                    <span className="text-foreground">{(user.trafficUsed).toFixed(2)}GB</span>
                    <span className="text-muted-foreground"> / {user.trafficLimit === 0 ? '∞' : `${user.trafficLimit}GB`}</span>
                  </td>
                  <td className="p-4">
                    <CyberBadge variant={user.status === 'active' ? 'default' : 'destructive'}>
                      {user.status}
                    </CyberBadge>
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {user.expiresAt ? format(new Date(user.expiresAt), 'yyyy-MM-dd') : 'Never'}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button onClick={() => openQr(user.id)} className="p-2 text-primary/70 hover:text-primary hover:bg-primary/10 rounded" title="QR Code">
                      <QrCode className="w-4 h-4" />
                    </button>
                    <button onClick={() => copyUrl(user.id)} className="p-2 text-primary/70 hover:text-primary hover:bg-primary/10 rounded" title="Copy URL">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(user)} className="p-2 text-primary/70 hover:text-primary hover:bg-primary/10 rounded" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleBlock(user)} className="p-2 text-accent/70 hover:text-accent hover:bg-accent/10 rounded" title={user.status === 'active' ? 'Block' : 'Unblock'}>
                      {user.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="p-2 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CyberCard>

      {/* Add User Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Provision User">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Alias / Name</label>
            <CyberInput value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Data Quota (GB, 0=Unlimited)</label>
            <CyberInput type="number" step="0.1" value={formData.trafficLimit} onChange={e => setFormData({...formData, trafficLimit: Number(e.target.value)})} required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Expiry Date (Optional)</label>
            <CyberInput type="date" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} />
          </div>
          <CyberButton type="submit" className="w-full mt-4" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Executing...' : 'Deploy Access'}
          </CyberButton>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Modify Directives">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Alias / Name</label>
            <CyberInput value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Data Quota (GB)</label>
            <CyberInput type="number" step="0.1" value={formData.trafficLimit} onChange={e => setFormData({...formData, trafficLimit: Number(e.target.value)})} required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Expiry Date</label>
            <CyberInput type="date" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} />
          </div>
          <CyberButton type="submit" className="w-full mt-4" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Updating...' : 'Commit Changes'}
          </CyberButton>
        </form>
      </Modal>

      {/* QR Code Modal */}
      <Modal isOpen={isQrOpen} onClose={() => {setIsQrOpen(false); setActiveQrUser(null);}} title="Access Vector">
        <div className="flex flex-col items-center justify-center space-y-6">
          {qrData ? (
            <>
              <div className="p-4 bg-white rounded-sm shadow-[0_0_20px_rgba(0,212,170,0.4)]">
                <img src={qrData.qrDataUrl} alt="QR Code" className="w-64 h-64" />
              </div>
              <div className="w-full">
                <label className="text-xs font-mono text-muted-foreground uppercase">VLESS Payload URL</label>
                <div className="flex mt-1 gap-2">
                  <CyberInput value={qrData.vlessUrl} readOnly className="text-xs text-muted-foreground" />
                  <CyberButton onClick={() => {navigator.clipboard.writeText(qrData.vlessUrl); alert('Copied!');}}>Copy</CyberButton>
                </div>
              </div>
            </>
          ) : (
            <div className="text-primary font-mono animate-pulse">Generating fractal...</div>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
