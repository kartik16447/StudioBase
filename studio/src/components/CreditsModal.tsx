import React, { useState } from 'react';
import { I } from './icons';
import { cn, Button } from './ui';
import { useStudioStore } from '../store/useStudioStore';

const CREDIT_PACKS = [
  { id: 'starter', label: 'Starter Pack', credits: 50,   price: '$5',  desc: 'Best for occasional use' },
  { id: 'growth',  label: 'Growth Pack',  credits: 100,  price: '$9',  desc: 'Most popular' },
  { id: 'scale',   label: 'Scale Pack',   credits: 200,  price: '$15', desc: 'For heavy teams · best value' },
] as const;

const PURCHASE_CONTACT = 'mailto:hello@studiobase.app?subject=Credit%20Purchase&body=Hi%2C%20I%27d%20like%20to%20purchase%20credits%20for%20my%20workspace.';

export const CreditsModal: React.FC = () => {
  const balance = useStudioStore(s => s.creditsBalance);
  const monthlyAllocation = useStudioStore(s => s.monthlyAllocation);
  const close = useStudioStore(s => s.setCreditsModalOpen);
  const [selected, setSelected] = useState<string>('growth');

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => close(false)}
    >
      <div
        className="bg-bg border border-border rounded-card shadow-card-lifted w-full max-w-[460px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <I.Zap size={16} className="text-primary" />
              <div className="text-[16px] font-semibold text-text">Get more credits</div>
            </div>
            <div className="text-[12px] text-text-2">
              Current balance:{' '}
              <span className="font-semibold text-text">{balance} credits</span>
              <span className="text-text-3 ml-1">· {monthlyAllocation}/mo included</span>
            </div>
          </div>
          <button
            onClick={() => close(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
          >
            <I.X size={15} />
          </button>
        </div>

        {/* Packs */}
        <div className="p-6 space-y-3">
          {CREDIT_PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => setSelected(pack.id)}
              className={cn(
                'w-full flex items-center justify-between p-4 rounded-card border text-left transition-all',
                selected === pack.id
                  ? 'border-primary bg-primary-light'
                  : 'border-border hover:border-primary/40 hover:bg-surface-2'
              )}
            >
              <div>
                <div className="text-[13.5px] font-semibold text-text">{pack.label}</div>
                <div className="text-[12px] text-text-2 mt-0.5">{pack.credits} credits · {pack.desc}</div>
              </div>
              <div className={cn('text-[18px] font-bold shrink-0 ml-4', selected === pack.id ? 'text-primary' : 'text-text')}>
                {pack.price}
              </div>
            </button>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 space-y-2">
          <Button
            variant="primary"
            size="md"
            icon={I.Mail}
            className="w-full justify-center"
            onClick={() => window.open(PURCHASE_CONTACT, '_blank')}
          >
            Contact us to purchase
          </Button>
          <p className="text-[11px] text-text-3 text-center">
            We'll confirm your order and top up credits within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
};
