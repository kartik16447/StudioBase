import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { I } from '../components/icons';
import { 
  cn, Badge, SectionLabel, Button, IconButton, FieldShell, Card 
} from '../components/ui';
import { ComingSoon } from '../components/studio/Panels';
import { useStudioStore } from '../store/useStudioStore';

const BRAND_TABS = [
  { id: 'logos', label: 'Logos', icon: I.Image, phase: 2 },
  { id: 'doctmpl', label: 'Doc Templates', icon: I.FileText, phase: 2 },
  { id: 'videotmpl', label: 'Video Templates', icon: I.Play, phase: 3 },
  { id: 'voices', label: 'Voices', icon: I.Mic, phase: 3 },
  { id: 'avatars', label: 'Avatars', icon: I.User, phase: 3 },
  { id: 'backgrounds', label: 'Backgrounds', icon: I.Image, phase: 4 },
  { id: 'music', label: 'Music', icon: I.Music2, phase: 3 },
  { id: 'glossary', label: 'Glossary', icon: I.Languages, phase: 4 },
];

export const BrandKitPage: React.FC = () => {
  const [active, setActive] = useState('logos');
  const activeTab = BRAND_TABS.find(t => t.id === active)!;
  const locked = activeTab.phase > 2;

  return (
    <div className="flex-1 min-h-0 scroll-y bg-bg">
      <div className="max-w-[1100px] mx-auto px-10 pt-10 pb-16">
        <Badge tone="primary" size="md" icon={I.Palette}>Workspace</Badge>
        <h1 className="text-[34px] font-semibold text-text tracking-tight leading-tight mt-3">Brand Kit</h1>
        <p className="text-[14.5px] text-text-2 mt-1.5">Your logo, palette and templates are applied to every SOP and video automatically.</p>

        <div className="mt-8 border-b border-border flex items-center gap-1 overflow-x-auto">
          {BRAND_TABS.map(t => {
            const isLocked = t.phase > 2;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 h-11 px-4 text-[13px] font-medium whitespace-nowrap',
                  isActive ? 'text-text' : 'text-text-2 hover:text-text',
                  isLocked && 'opacity-60',
                )}
              >
                <t.icon size={14} />
                {t.label}
                {isLocked && <I.Lock size={11} className="text-text-3" />}
                {isActive && (
                  <motion.span 
                    layoutId="brand-tab" 
                    className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" 
                    transition={{ type:'spring', stiffness:420, damping:34 }} 
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 min-h-[400px] relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {locked ? (
                <ComingSoon 
                  title={activeTab.label} 
                  phase={activeTab.phase} 
                  description={`This brand kit section unlocks in Phase ${activeTab.phase}.`}
                >
                  <div className="grid grid-cols-3 gap-4">
                    {[0,1,2,3,4,5].map(i => <div key={i} className="aspect-[4/3] rounded-card bg-surface shadow-card stripe-placeholder" />)}
                  </div>
                </ComingSoon>
              ) : active === 'logos' ? <LogosTab /> : <DocTemplatesTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const LogosTab: React.FC = () => {
  const { brand, setBrand } = useStudioStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <SectionLabel>Workspace logo</SectionLabel>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBrand({ logoUrl: URL.createObjectURL(file) });
          }}
        />

        {brand.logoUrl ? (
          <div className="relative h-56 flex items-center justify-center grad-border mb-6">
            <img src={brand.logoUrl} className="max-h-36 max-w-xs object-contain" />
            <button
              onClick={(e) => { e.stopPropagation(); setBrand({ logoUrl: null }); }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-surface flex items-center justify-center shadow-card hover:text-danger"
            >
              <I.X size={14} />
            </button>
          </div>
        ) : (
          <div 
            className="grad-border h-56 flex items-center justify-center mb-6 cursor-pointer hover:bg-surface-2 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary-light flex items-center justify-center mb-3">
                <I.Upload size={20} className="text-primary" />
              </div>
              <div className="text-[14px] font-semibold text-text mb-1">Drag & drop your logo</div>
              <div className="text-[12px] text-text-2">SVG or PNG, transparent background recommended</div>
              <Button variant="ghost" size="sm" className="mt-4">Browse files</Button>
            </div>
          </div>
        )}

        <SectionLabel hint="Used on intro/outro & exports">Logo variants</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {['Light', 'Dark', 'Icon'].map((v, i) => (
            <Card key={v} className="p-5">
              <div
                className="h-20 rounded-img mb-3 flex items-center justify-center font-black text-[28px]"
                style={{
                  background: i === 1 ? '#111' : '#FFF',
                  color: i === 1 ? '#FFF' : '#1D1D1F',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                {i === 2 ? <span style={{ color: brand.primaryColor }}>S</span> : <span>Studio<span style={{ color: brand.primaryColor }}>Base</span></span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{v}</span>
                <IconButton icon={I.Download} label="Download" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Primary color</SectionLabel>
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {['#5E5CE6','#0A84FF','#30D158','#FF9F0A','#FF453A','#BF5AF2'].map(c => (
              <button
                key={c}
                onClick={() => setBrand({ primaryColor: c })}
                className={cn('aspect-square rounded-img relative transition-transform hover:scale-105', brand.primaryColor === c && 'ring-2 ring-offset-2 ring-text')}
                style={{ background: c }}
              >
                {brand.primaryColor === c && <I.Check size={18} className="text-white absolute inset-0 m-auto" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <FieldShell icon={I.Type}>
            <span className="text-text-3 text-[11px] font-mono uppercase">HEX</span>
            <input value={brand.primaryColor} onChange={e => setBrand({ primaryColor: e.target.value })} className="flex-1 bg-transparent outline-none text-sm font-mono" />
            <span className="w-5 h-5 rounded" style={{ background: brand.primaryColor }} />
          </FieldShell>
        </Card>

        <SectionLabel className="mt-6">Font</SectionLabel>
        <Card className="p-5">
          <div className="text-text-2 text-[11px] mb-1">Currently using</div>
          <div className="text-[22px] font-semibold tracking-tight">{brand.font}</div>
          <div className="text-[13px] text-text-2 mt-1">A versatile sans-serif with high legibility at small sizes.</div>
          <Button variant="ghost" size="sm" className="mt-4" iconRight={I.ChevronDown}>Change font</Button>
        </Card>
      </div>
    </div>
  );
};

const DocTemplatesTab: React.FC = () => {
  const templates = [
    { name: 'Compact', desc: 'Side-by-side screenshot and instructions', hue: 244, layout: 'compact' },
    { name: 'Hero', desc: 'Full-width screenshot, instructions below', hue: 198, layout: 'hero' },
    { name: 'Numbered', desc: 'Big watermark number, minimalist body', hue: 162, layout: 'numbered' },
    { name: 'Briefing', desc: 'Two-column with collapsible details', hue: 22, layout: 'briefing' },
    { name: 'Quick reference', desc: 'Card grid for power users', hue: 282, layout: 'grid' },
    { name: 'Tutorial', desc: 'Chapter-driven, with summary boxes', hue: 50, layout: 'tutorial' },
  ];
  return (
    <div className="grid grid-cols-3 gap-5">
      {templates.map((t, i) => (
        <Card key={t.name} variant="interactive" className={cn(i === 0 && 'ring-2 ring-primary')}>
          <div className="aspect-[5/4] p-4 stripe-placeholder relative">
            <TemplatePreview layout={t.layout} hue={t.hue} />
            {i === 0 && <Badge tone="primary" size="sm" className="absolute top-2 right-2">In use</Badge>}
          </div>
          <div className="p-4 border-t border-border">
            <div className="text-[14px] font-semibold text-text">{t.name}</div>
            <div className="text-[12px] text-text-2 mt-0.5">{t.desc}</div>
          </div>
        </Card>
      ))}
    </div>
  );
};

const TemplatePreview: React.FC<{ layout: string, hue: number }> = ({ layout, hue }) => {
  const tint = `hsl(${hue} 70% 60%)`;
  if (layout === 'numbered') {
    return (
      <div className="bg-white rounded-img h-full p-3 relative shadow-inner-border">
        <div className="absolute top-2 right-2 font-black text-[40px]" style={{ color: tint, opacity: 0.18 }}>01</div>
        <div className="h-12 rounded mb-2 bg-gradient-to-br from-white to-surface-2 border border-border" />
        <div className="h-1.5 rounded bg-text/70 w-3/4 mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-5/6" />
      </div>
    );
  }
  if (layout === 'hero') {
    return (
      <div className="bg-white rounded-img h-full p-2">
        <div className="h-1/2 rounded mb-1.5 border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
        <div className="h-1.5 rounded bg-text/80 w-3/4 mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-5/6" />
      </div>
    );
  }
  if (layout === 'compact') {
    return (
      <div className="bg-white rounded-img h-full p-2 flex gap-2">
        <div className="w-1/2 rounded border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
        <div className="w-1/2 space-y-1.5 py-1">
          <div className="h-1.5 rounded bg-text/80 w-3/4" />
          <div className="h-1.5 rounded bg-text/30 w-full" />
          <div className="h-1.5 rounded bg-text/30 w-5/6" />
          <div className="h-1.5 rounded bg-text/30 w-3/4" />
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-img h-full p-2">
      <div className="h-2 rounded mb-2" style={{ background: tint, width: '30%' }} />
      <div className="h-1.5 rounded bg-text/70 w-2/3 mb-1" />
      <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
      <div className="h-8 rounded mt-1.5 border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
    </div>
  );
};
