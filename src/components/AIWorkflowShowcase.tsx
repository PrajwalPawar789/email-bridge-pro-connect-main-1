import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import {
  BarChart3,
  GitBranch,
  LayoutTemplate,
  MessageSquare,
  Users,
  Workflow,
  Sparkles,
  Zap,
  ArrowRight
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DemoType =
  | 'automation'
  | 'insights'
  | 'builder'
  | 'reply'
  | 'segmentation'
  | 'sequences';

type Feature = {
  id: string;
  title: string;
  benefit: string;
  description: string;
  icon: LucideIcon;
  demo: DemoType;
  insight?: string;
};

const showcaseFeatures: Feature[] = [
  {
    id: 'automation',
    title: 'Automation Flow',
    benefit:
      'Design intelligent workflows that trigger the right message at the right moment - fully optimized by AI.',
    description:
      'Map triggers, wait steps, and conditional routing while AI tunes pacing for every audience.',
    icon: Workflow,
    demo: 'automation',
    insight: 'AI optimizes timing automatically'
  },
  {
    id: 'insights',
    title: 'AI Insights Engine',
    benefit:
      'Turn engagement data into precise recommendations that continuously improve campaign performance.',
    description:
      'Convert opens, clicks, and replies into prioritized recommendations for send time, content, and sequencing.',
    icon: BarChart3,
    demo: 'insights',
    insight: 'Best send time: Tuesday 10 AM'
  },
  {
    id: 'builder',
    title: 'Intelligent Campaign Builder',
    benefit:
      'Create high-converting emails with AI-assisted structure, content, and personalization.',
    description:
      'Assemble modular emails with AI guidance on structure, messaging, and personalization logic.',
    icon: LayoutTemplate,
    demo: 'builder',
    insight: 'No design skills needed'
  },
  {
    id: 'reply',
    title: 'AI Follow-Up Generator',
    benefit:
      'Automatically draft context-aware follow-ups based on real recipient behavior.',
    description:
      'Draft follow-ups with context from replies, clicks, and previous conversations.',
    icon: MessageSquare,
    demo: 'reply',
    insight: 'Follow-ups written by AI'
  },
  {
    id: 'segmentation',
    title: 'Adaptive Segmentation',
    benefit:
      'Continuously reclassify leads across funnel stages based on intent and engagement signals.',
    description:
      'Reclassify leads across lifecycle stages as intent signals change, keeping messaging aligned.',
    icon: Users,
    demo: 'segmentation',
    insight: 'AI moves leads automatically'
  },
  {
    id: 'sequences',
    title: 'Self-Adjusting Sequences',
    benefit:
      'Sequences evolve in real time, optimizing tone, timing, and paths for every prospect.',
    description:
      'Sequence logic adapts to replies and non-responses, optimizing timing and outreach paths.',
    icon: GitBranch,
    demo: 'sequences',
    insight: 'Sequences adapt in real time'
  }
];

const useInViewOnce = (
  ref: React.RefObject<HTMLElement>,
  options?: { threshold?: number; rootMargin?: string }
) => {
  const [inView, setInView] = useState(false);
  const threshold = options?.threshold ?? 0.2;
  const rootMargin = options?.rootMargin ?? '0px';

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return inView;
};

const useCountUp = (target: number, active: boolean, duration = 900) => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let frameId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, active, duration]);

  return value;
};

const useTypewriter = (text: string, active: boolean) => {
  const [output, setOutput] = useState('');

  useEffect(() => {
    if (!active) {
      setOutput('');
      return;
    }

    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setOutput(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(interval);
      }
    }, 28);

    return () => clearInterval(interval);
  }, [text, active]);

  return output;
};

const FeatureCard = ({
  feature,
  index,
  reveal,
  isActive,
  isSelected,
  onHover,
  onSelect
}: {
  feature: Feature;
  index: number;
  reveal: boolean;
  isActive: boolean;
  isSelected: boolean;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}) => {
  const Icon = feature.icon;
  const active = isActive || isSelected;

  return (
    <motion.div
      className="h-full"
      custom={index}
      initial="hidden"
      animate={reveal ? 'visible' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
          opacity: 1,
          y: 0,
          transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' }
        })
      }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onMouseEnter={() => onHover(index)}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        onFocus={() => onHover(index)}
        onBlur={() => onHover(null)}
        className="ai-feature-card group relative h-full w-full min-h-[160px] px-5 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        data-active={active}
        aria-pressed={isSelected}
      >
        {/* Radial glow on hover/active */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{
            background: 'radial-gradient(circle at top, hsl(187 85% 53% / 0.12), transparent 60%)'
          }}
        />
        
        {/* Left accent bar */}
        {active && <span className="ai-accent-bar" aria-hidden="true" />}
        
        <div className="relative z-10 flex items-start gap-4">
          <div
            className="ai-icon-container transition-all duration-300"
            data-active={active}
          >
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="ai-label">Core capability</p>
            <p className="ai-title mt-2">{feature.title}</p>
            <p className="ai-body mt-2 line-clamp-2">{feature.benefit}</p>
          </div>
        </div>
      </button>
    </motion.div>
  );
};

const MiniDemo = ({
  type,
  active,
  insight
}: {
  type: DemoType;
  active: boolean;
  insight?: string;
}) => {
  const countUp = useCountUp(42, active);
  const typed = useTypewriter('Thanks for engaging. Here is a tailored follow up.', active);

  if (type === 'automation') {
    const steps = ['Trigger', 'Wait', 'Follow up'];
    return (
      <div className="ai-demo-container">
        <div className="flex items-center justify-between gap-4">
          {steps.map((step, index) => (
            <React.Fragment key={step}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={active ? { opacity: 1, scale: 1 } : { opacity: 0.5, scale: 0.96 }}
                transition={{ delay: index * 0.15, duration: 0.4 }}
                className="flex flex-1 flex-col items-center gap-2.5"
              >
                <div className="ai-step-dot" />
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-medium">
                  {step}
                </p>
              </motion.div>
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-primary/40 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
        
        <div className="ai-divider-glow mt-5" />
        
        {insight && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ delay: 0.45, duration: 0.35 }}
            className="mt-5"
          >
            <span className="ai-insight-badge">
              <Zap className="h-3 w-3 mr-1.5" />
              {insight}
            </span>
          </motion.div>
        )}
      </div>
    );
  }

  if (type === 'insights') {
    const barHeights = [24, 38, 48, 36, 56];
    return (
      <div className="ai-demo-container">
        <div className="flex items-center justify-between text-xs mb-4">
          <span className="text-muted-foreground font-medium">Open rate</span>
          <span className="text-primary font-semibold">{countUp}%</span>
        </div>
        
        <div className="flex items-end justify-between gap-3 h-16">
          {barHeights.map((height, index) => (
            <motion.div
              key={index}
              initial={{ height: 8, opacity: 0.3 }}
              animate={{
                height: active ? height : 12,
                opacity: active ? 1 : 0.4
              }}
              transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
              className="ai-chart-bar flex-1"
            />
          ))}
        </div>
        
        {insight && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary"
          >
            <Sparkles className="inline h-3 w-3 mr-1.5" />
            {insight}
          </motion.p>
        )}
      </div>
    );
  }

  if (type === 'builder') {
    const blocks = ['Header', 'Body', 'CTA'];
    return (
      <div className="ai-demo-container">
        <div className="flex flex-col gap-3">
          {blocks.map((block, index) => (
            <motion.div
              key={block}
              initial={{ opacity: 0, x: 20 }}
              animate={active ? { opacity: 1, x: 0 } : { opacity: 0.4, x: 0 }}
              transition={{ delay: index * 0.12, duration: 0.4 }}
              className="h-11 rounded-xl border border-border/50 bg-secondary/50 px-4 py-2.5 text-xs uppercase tracking-[0.3em] text-muted-foreground font-medium flex items-center"
            >
              {block}
            </motion.div>
          ))}
        </div>
        
        {insight && (
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
            <Sparkles className="inline h-3 w-3 mr-1.5" />
            {insight}
          </p>
        )}
      </div>
    );
  }

  if (type === 'reply') {
    return (
      <div className="ai-demo-container">
        <div className="rounded-xl bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
          <span className="text-primary/70 font-medium">Prospect:</span> Interested, can you share details?
        </div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={active ? { opacity: 1 } : { opacity: 0.5 }}
          transition={{ duration: 0.4 }}
          className="mt-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-xs text-primary min-h-[60px]"
        >
          <span className="text-primary/70 font-medium">AI Draft:</span> {typed}
          <span className="animate-pulse">|</span>
        </motion.div>
        
        {insight && (
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
            <Zap className="inline h-3 w-3 mr-1.5" />
            {insight}
          </p>
        )}
      </div>
    );
  }

  if (type === 'segmentation') {
    const stages = ['New', 'Engaged', 'Qualified'];
    return (
      <div className="ai-demo-container">
        <div className="grid grid-cols-3 gap-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-medium text-center">
          {stages.map((stage) => (
            <span key={stage}>{stage}</span>
          ))}
        </div>
        
        <div className="relative mt-4 h-12 rounded-xl bg-secondary/40 overflow-hidden">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              initial={{ x: 0, opacity: 0.4 }}
              animate={active ? {
                x: [0, 48, 96],
                opacity: [0.4, 1, 0.6]
              } : { x: 0, opacity: 0.4 }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: index * 0.35,
                ease: 'easeInOut'
              }}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full left-4"
              style={{
                background: 'hsl(var(--primary))',
                boxShadow: '0 0 12px hsl(var(--primary) / 0.6)'
              }}
            />
          ))}
        </div>
        
        {insight && (
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
            <Sparkles className="inline h-3 w-3 mr-1.5" />
            {insight}
          </p>
        )}
      </div>
    );
  }

  // Sequences demo
  return (
    <div className="ai-demo-container">
      <div className="relative h-24">
        {/* Nodes */}
        <div className="absolute left-3 top-3 h-7 w-7 rounded-full border-2 border-primary/50 bg-primary/20 flex items-center justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
        <div className="absolute left-3 bottom-3 h-7 w-7 rounded-full border-2 border-primary/50 bg-primary/20 flex items-center justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
        <div className="absolute right-3 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-2 border-accent/50 bg-accent/20 flex items-center justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-accent" />
        </div>
        
        {/* Connecting lines */}
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: active ? [0.3, 0.8, 0.3] : 0.3 }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute left-10 top-6 h-14 w-28 border-l-2 border-t-2 border-primary/50 rounded-tl-2xl"
        />
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: active ? [0.3, 0.8, 0.3] : 0.3 }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          className="absolute left-10 bottom-6 h-14 w-28 border-l-2 border-b-2 border-primary/50 rounded-bl-2xl"
        />
      </div>
      
      {insight && (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
          <Zap className="inline h-3 w-3 mr-1.5" />
          {insight}
        </p>
      )}
    </div>
  );
};

// Enterprise-grade preview visualizations for each feature
const FeaturePreview = ({ type, active }: { type: DemoType; active: boolean }) => {
  if (type === 'automation') {
    // Automation Flow - Node-based workflow diagram
    return (
      <div className="relative w-full h-full min-h-[280px] p-6 flex items-center justify-center">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'linear-gradient(hsl(var(--primary) / 0.1) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
        
        {/* Workflow nodes */}
        <div className="relative flex items-center justify-between w-full max-w-[320px]">
          {/* Start Node */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.5 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="relative flex flex-col items-center"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-400/50 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <div className="w-5 h-5 rounded-full bg-emerald-400 shadow-[0_0_12px_hsl(160_85%_45%)]" />
            </div>
            <span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Start</span>
          </motion.div>
          
          {/* Connecting line 1 */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={active ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="absolute left-[70px] top-[28px] w-[60px] h-[2px] origin-left"
            style={{ background: 'linear-gradient(90deg, hsl(160 85% 45% / 0.6), hsl(var(--primary) / 0.8))' }}
          >
            <motion.div
              animate={active ? { x: [0, 60], opacity: [1, 0] } : {}}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.5 }}
              className="absolute top-[-3px] left-0 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            />
          </motion.div>
          
          {/* Condition Node */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.5 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="relative flex flex-col items-center"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/20 rotate-0">
              <GitBranch className="w-6 h-6 text-primary" />
            </div>
            <span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Route</span>
          </motion.div>
          
          {/* Connecting line 2 */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={active ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="absolute left-[180px] top-[28px] w-[60px] h-[2px] origin-left"
            style={{ background: 'linear-gradient(90deg, hsl(var(--primary) / 0.8), hsl(280 80% 60% / 0.6))' }}
          >
            <motion.div
              animate={active ? { x: [0, 60], opacity: [1, 0] } : {}}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.8 }}
              className="absolute top-[-3px] left-0 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            />
          </motion.div>
          
          {/* Action Node */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.5 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="relative flex flex-col items-center"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 border-2 border-violet-400/50 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <MessageSquare className="w-6 h-6 text-violet-400" />
            </div>
            <span className="mt-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Send</span>
          </motion.div>
        </div>
        
        {/* Status badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ delay: 0.7, duration: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-400/30"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Workflow Active
          </span>
        </motion.div>
      </div>
    );
  }

  if (type === 'insights') {
    // Analytics Dashboard Preview
    return (
      <div className="relative w-full h-full min-h-[280px] p-5 flex flex-col">
        {/* Dashboard header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex items-center justify-between mb-4"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">Performance</span>
          <span className="text-[10px] text-primary font-semibold">Live</span>
        </motion.div>
        
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Opens', value: '68%', color: 'primary' },
            { label: 'Clicks', value: '24%', color: 'accent' },
            { label: 'Replies', value: '12%', color: 'violet' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={active ? { opacity: 1, scale: 1 } : { opacity: 0.5, scale: 0.95 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.3 }}
              className="p-3 rounded-xl bg-secondary/40 border border-border/30 text-center"
            >
              <p className={`text-lg font-bold ${stat.color === 'primary' ? 'text-primary' : stat.color === 'accent' ? 'text-accent' : 'text-violet-400'}`}>
                {stat.value}
              </p>
              <p className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
        
        {/* Chart area */}
        <div className="flex-1 relative rounded-xl bg-secondary/20 border border-border/20 p-4 overflow-hidden">
          <div className="flex items-end justify-between h-full gap-2">
            {[40, 65, 45, 80, 55, 90, 70, 85].map((height, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={active ? { height: `${height}%` } : { height: '20%' }}
                transition={{ delay: 0.4 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                className="flex-1 rounded-t-md"
                style={{
                  background: `linear-gradient(to top, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.8))`
                }}
              />
            ))}
          </div>
          
          {/* Trend line overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={active ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.8, duration: 0.3 }}
            className="absolute top-4 right-4 flex items-center gap-1 text-emerald-400"
          >
            <ArrowRight className="w-3 h-3 rotate-[-45deg]" />
            <span className="text-[10px] font-semibold">+18%</span>
          </motion.div>
        </div>
      </div>
    );
  }

  if (type === 'builder') {
    // Email Builder Preview
    return (
      <div className="relative w-full h-full min-h-[280px] p-5 flex flex-col gap-3">
        {/* Email template blocks */}
        {[
          { label: 'Header', icon: LayoutTemplate, height: 'h-12' },
          { label: 'Hero Image', icon: LayoutTemplate, height: 'h-20' },
          { label: 'Content Block', icon: MessageSquare, height: 'h-16' },
          { label: 'CTA Button', icon: ArrowRight, height: 'h-10' }
        ].map((block, i) => (
          <motion.div
            key={block.label}
            initial={{ opacity: 0, x: 20 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0.4, x: 0 }}
            transition={{ delay: 0.15 * i, duration: 0.4 }}
            className={`relative ${block.height} rounded-xl border border-border/40 bg-secondary/30 flex items-center px-4 gap-3 group hover:border-primary/40 transition-colors cursor-pointer`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <block.icon className="w-4 h-4 text-primary/70" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">{block.label}</span>
            
            {/* Drag handle */}
            <div className="ml-auto flex flex-col gap-0.5 opacity-30">
              <div className="flex gap-0.5">
                <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                <div className="w-1 h-1 rounded-full bg-muted-foreground" />
              </div>
              <div className="flex gap-0.5">
                <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                <div className="w-1 h-1 rounded-full bg-muted-foreground" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (type === 'reply') {
    // AI Reply Generator Preview
    return (
      <div className="relative w-full h-full min-h-[280px] p-5 flex flex-col">
        {/* Conversation thread */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Incoming message */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0.5, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="max-w-[85%] p-3 rounded-xl rounded-tl-sm bg-secondary/50 border border-border/30"
          >
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Lead</p>
            <p className="text-xs text-foreground/80">I'm interested in learning more about your enterprise plan pricing.</p>
          </motion.div>
          
          {/* AI Generated Reply */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0.5, x: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="max-w-[85%] self-end p-3 rounded-xl rounded-tr-sm bg-primary/10 border border-primary/30"
          >
            <div className="flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-primary" />
              <p className="text-[10px] text-primary font-medium">AI Draft</p>
            </div>
            <p className="text-xs text-foreground/80">Thanks for reaching out! Our enterprise plan includes unlimited seats, priority support, and custom integrations...</p>
          </motion.div>
        </div>
        
        {/* Action bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ delay: 0.7, duration: 0.3 }}
          className="mt-4 flex items-center gap-2"
        >
          <div className="flex-1 h-9 rounded-lg bg-secondary/40 border border-border/30 flex items-center px-3">
            <span className="text-[10px] text-muted-foreground">Edit or send...</span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-primary" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (type === 'segmentation') {
    // Lead Segmentation Preview
    return (
      <div className="relative w-full h-full min-h-[280px] p-5">
        {/* Funnel stages */}
        <div className="flex justify-between items-start mb-6">
          {['Cold', 'Warm', 'Hot', 'Customer'].map((stage, i) => (
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: -10 }}
              animate={active ? { opacity: 1, y: 0 } : { opacity: 0.5, y: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 ${
                i === 0 ? 'border-blue-400/50 bg-blue-400/10' :
                i === 1 ? 'border-amber-400/50 bg-amber-400/10' :
                i === 2 ? 'border-orange-400/50 bg-orange-400/10' :
                'border-emerald-400/50 bg-emerald-400/10'
              }`}>
                <span className={`text-xs font-bold ${
                  i === 0 ? 'text-blue-400' :
                  i === 1 ? 'text-amber-400' :
                  i === 2 ? 'text-orange-400' :
                  'text-emerald-400'
                }`}>{[124, 67, 28, 12][i]}</span>
              </div>
              <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground font-medium">{stage}</span>
            </motion.div>
          ))}
        </div>
        
        {/* Animated lead moving through funnel */}
        <div className="relative h-24 rounded-xl bg-secondary/20 border border-border/20 overflow-hidden">
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-blue-400/30 via-amber-400/30 via-orange-400/30 to-emerald-400/30" />
          
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ x: 0 }}
              animate={active ? {
                x: ['0%', '100%', '200%', '280%'],
                scale: [1, 1.1, 1.1, 1.2]
              } : { x: 0 }}
              transition={{
                duration: 4,
                repeat: Infinity,
                delay: i * 1.2,
                ease: 'easeInOut'
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2"
            >
              <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            </motion.div>
          ))}
        </div>
        
        {/* AI insight */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={active ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          className="mt-4 text-center"
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
            <Sparkles className="inline w-3 h-3 mr-1" />
            AI scoring 231 leads
          </span>
        </motion.div>
      </div>
    );
  }

  // Sequences - Branching flow visualization
  return (
    <div className="relative w-full h-full min-h-[280px] p-5 flex items-center justify-center">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-15" style={{
        backgroundImage: 'linear-gradient(hsl(var(--primary) / 0.15) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.15) 1px, transparent 1px)',
        backgroundSize: '16px 16px'
      }} />
      
      <div className="relative w-full max-w-[280px]">
        {/* Start node */}
        <motion.div
          initial={{ scale: 0 }}
          animate={active ? { scale: 1 } : { scale: 0.8 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-primary/20 border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/20"
        >
          <Workflow className="w-5 h-5 text-primary" />
        </motion.div>
        
        {/* Branch lines */}
        <svg className="absolute left-12 top-0 w-[180px] h-full" viewBox="0 0 180 120">
          <motion.path
            d="M 0 60 Q 40 60 60 30 L 120 30"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeOpacity="0.5"
            initial={{ pathLength: 0 }}
            animate={active ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          />
          <motion.path
            d="M 0 60 L 120 60"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeOpacity="0.5"
            initial={{ pathLength: 0 }}
            animate={active ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          />
          <motion.path
            d="M 0 60 Q 40 60 60 90 L 120 90"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeOpacity="0.5"
            initial={{ pathLength: 0 }}
            animate={active ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          />
        </svg>
        
        {/* Branch end nodes */}
        {[
          { top: '10%', label: 'Path A', color: 'emerald' },
          { top: '50%', label: 'Path B', color: 'primary' },
          { top: '90%', label: 'Path C', color: 'violet' }
        ].map((node, i) => (
          <motion.div
            key={node.label}
            initial={{ scale: 0, opacity: 0 }}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.5 }}
            transition={{ delay: 0.6 + i * 0.1, duration: 0.3 }}
            className="absolute right-0 -translate-y-1/2 flex items-center gap-2"
            style={{ top: node.top }}
          >
            <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center ${
              node.color === 'emerald' ? 'border-emerald-400/50 bg-emerald-400/10' :
              node.color === 'primary' ? 'border-primary/50 bg-primary/10' :
              'border-violet-400/50 bg-violet-400/10'
            }`}>
              <MessageSquare className={`w-4 h-4 ${
                node.color === 'emerald' ? 'text-emerald-400' :
                node.color === 'primary' ? 'text-primary' :
                'text-violet-400'
              }`} />
            </div>
          </motion.div>
        ))}
        
        {/* Animated particles along paths */}
        {active && [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            initial={{ left: 12, top: '50%' }}
            animate={{
              left: [12, 80, 180],
              top: ['50%', i === 0 ? '10%' : i === 1 ? '50%' : '90%', i === 0 ? '10%' : i === 1 ? '50%' : '90%']
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.7,
              ease: 'easeInOut'
            }}
          />
        ))}
      </div>
    </div>
  );
};

const DetailPanel = ({
  feature,
  index,
  total,
  active,
  highlighted
}: {
  feature: Feature;
  index: number;
  total: number;
  active: boolean;
  highlighted: boolean;
}) => {
  const progress = ((index + 1) / total) * 100;
  const Icon = feature.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`
        relative overflow-hidden rounded-3xl p-8 lg:p-10
        border backdrop-blur-xl
        min-h-[520px] lg:min-h-[580px]
        flex flex-col
        transition-all duration-500
        ${highlighted 
          ? 'border-primary/40 shadow-[0_0_60px_-12px_hsl(var(--primary)/0.35)]' 
          : 'border-border/30 shadow-[0_30px_80px_-20px_hsl(220_30%_10%/0.6)]'
        }
      `}
      style={{
        background: 'linear-gradient(145deg, hsl(215 35% 8% / 0.95), hsl(220 40% 6% / 0.9))'
      }}
    >
      {/* Decorative glow orbs */}
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-accent/8 blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground font-medium">
          Feature {index + 1} of {total}
        </span>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          AI Guided
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="relative z-10 mt-5 h-2 w-full rounded-full bg-secondary/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(172 80% 55%), hsl(var(--accent)))'
          }}
        />
        {/* Glow effect on progress */}
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${progress - 2}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="absolute top-0 h-full w-4 rounded-full blur-sm"
          style={{
            background: 'hsl(var(--primary))',
            opacity: 0.6
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={feature.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative z-10 mt-8 flex-1 flex flex-col"
        >
          {/* Title & description */}
          <div>
            <h3 className="text-2xl lg:text-3xl font-semibold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
              {feature.title}
            </h3>
            <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-lg">
              {feature.description}
            </p>
          </div>

          {/* Demo + Preview grid */}
          <div className="mt-8 flex-1 grid gap-6 lg:grid-cols-2 items-stretch">
            {/* Mini Demo */}
            <div className="flex flex-col">
              <MiniDemo type={feature.demo} active={active} insight={feature.insight} />
            </div>
            
            {/* Enterprise Feature Preview */}
            <motion.div 
              key={`preview-${feature.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="relative rounded-2xl border border-border/40 bg-gradient-to-br from-secondary/30 to-secondary/10 overflow-hidden"
            >
              <FeaturePreview type={feature.demo} active={active} />
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

const AIWorkflowShowcase = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInViewOnce(sectionRef, { threshold: 0.15, rootMargin: '-5% 0px' });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = hoveredIndex ?? selectedIndex;
  const activeFeature = showcaseFeatures[activeIndex];

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start']
  });
  const gridShift = useTransform(scrollYProgress, [0, 1], [0, -60]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  return (
    <section
      id="features"
      ref={sectionRef}
      className="relative isolate overflow-hidden ai-section-bg py-28"
    >
      {/* Background effects */}
      <motion.div
        style={{ y: gridShift }}
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 ai-radial-glow-tl" />
        <div className="absolute inset-0 ai-radial-glow-br" />
        <div className="absolute inset-0 ai-grid-pattern opacity-50" />
      </motion.div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground font-medium">
            Enterprise AI Capabilities
          </p>
          <h2 className="mt-5 text-3xl md:text-5xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
            Every Feature is Designed to Move Prospects to Pipeline
          </h2>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl">
            EmailBridge operationalizes AI across automation, content, and sequencing to
            accelerate qualified pipeline with precision.
          </p>
        </motion.div>
      </div>

      {/* Main content grid */}
      <div className="relative mt-16">
        <div className="container mx-auto px-4 lg:sticky lg:top-[8vh]">
          <div className="grid items-stretch gap-8 lg:grid-cols-[minmax(320px,480px)_minmax(400px,1fr)]">
            {/* Feature cards grid */}
            <div
              className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-2"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {showcaseFeatures.map((feature, index) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  index={index}
                  reveal={inView}
                  isActive={hoveredIndex === index}
                  isSelected={selectedIndex === index}
                  onHover={setHoveredIndex}
                  onSelect={handleSelect}
                />
              ))}
            </div>
            
            {/* Detail panel */}
            <div className="lg:sticky lg:top-[8vh]">
              <DetailPanel
                feature={activeFeature}
                index={activeIndex}
                total={showcaseFeatures.length}
                active={inView}
                highlighted={hoveredIndex !== null}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AIWorkflowShowcase;
