import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CyberCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("cyber-card", className)} {...props} />
  )
);
CyberCard.displayName = "CyberCard";

type ButtonVariant = 'default' | 'destructive' | 'outline';

export const CyberButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <button 
        ref={ref} 
        className={cn(
          "cyber-button", 
          variant === 'destructive' && "cyber-button-destructive",
          variant === 'outline' && "cyber-button-outline",
          className
        )} 
        {...props} 
      />
    );
  }
);
CyberButton.displayName = "CyberButton";

export const CyberInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("cyber-input", className)} {...props} />
  )
);
CyberInput.displayName = "CyberInput";

export const CyberBadge = ({ className, children, variant = 'default' }: { className?: string, children: React.ReactNode, variant?: 'default' | 'destructive' | 'muted' }) => (
  <span className={cn(
    "cyber-badge", 
    variant === 'destructive' && "cyber-badge-destructive",
    variant === 'muted' && "cyber-badge-muted",
    className
  )}>
    {children}
  </span>
);

export function Modal({ isOpen, onClose, title, children, className }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className={cn("cyber-card w-full max-w-lg z-10 max-h-[90vh] flex flex-col shadow-[0_0_30px_rgba(0,212,170,0.15)]", className)}
          >
            <div className="flex items-center justify-between p-4 border-b border-primary/20 bg-primary/5">
              <h2 className="text-xl font-display text-primary uppercase tracking-widest font-bold">{title}</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
