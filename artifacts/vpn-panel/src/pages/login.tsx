import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { TerminalSquare, Lock } from 'lucide-react';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { CyberCard, CyberButton, CyberInput } from '@/components/ui/cyber';
import { motion } from 'framer-motion';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const loginMutation = useLogin();
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const data = await loginMutation.mutateAsync({ data: { username, password } });
      login(data.token);
      setLocation('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Authentication failed. Access denied.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 z-0">
      <div className="fixed inset-0 z-[-1] pointer-events-none">
        <img 
          src={`${import.meta.env.BASE_URL}images/cyber-bg.png`} 
          className="w-full h-full object-cover opacity-30 mix-blend-screen" 
          alt="Cyber background" 
        />
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <CyberCard className="p-8 border-t-4 border-t-primary shadow-[0_10px_40px_rgba(0,212,170,0.15)]">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary/10 border-2 border-primary flex items-center justify-center text-primary mb-4 shadow-[0_0_20px_rgba(0,212,170,0.3)]">
              <TerminalSquare className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold font-display text-primary tracking-[0.2em] uppercase">Sys_Auth</h1>
            <p className="text-muted-foreground font-mono text-xs mt-2 uppercase tracking-widest">VPN Control Matrix</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-destructive/10 border border-destructive/50 text-destructive font-mono text-sm">
              <span className="font-bold mr-2">[ERROR]</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Operator_ID</label>
              <CyberInput 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="admin"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Passkey</label>
              <div className="relative">
                <CyberInput 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••"
                  required
                />
                <Lock className="absolute right-3 top-3 w-4 h-4 text-primary/50" />
              </div>
            </div>

            <CyberButton 
              type="submit" 
              className="w-full mt-4 h-12 text-lg shadow-[0_0_15px_rgba(0,212,170,0.3)]"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Authenticating...' : 'Initialize Connection'}
            </CyberButton>
          </form>
        </CyberCard>
      </motion.div>
    </div>
  );
}
