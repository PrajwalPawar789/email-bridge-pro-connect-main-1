import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Globe } from 'lucide-react';
import Navbar from '../components/Navbar';
import Logo from '../components/Logo';
import AIWorkflowShowcase from '../components/AIWorkflowShowcase';
import { supabase } from '@/integrations/supabase/client';

const stats = [
  { label: 'Inboxing rate', value: '98.2%' },
  { label: 'Reply lift', value: '3.4x' },
  { label: 'Launch speed', value: '2.1x' },
  { label: 'Active regions', value: '120+' }
];

const logoStrip = ['Northwind', 'PilotWorks', 'Crescent', 'Everlane', 'Apollo', 'Harbor', 'Atlas'];

const painPoints = [
  'Campaign data lives across inboxes, spreadsheets, and CRMs.',
  'Deliverability drops without visibility or warmup controls.',
  'Teams lose momentum when personalization and follow-ups are manual.',
  'Revenue leaders lack a single view of pipeline-impacting email.'
];

const uspPoints = [
  'Conversion-first sequencing with real-time deliverability signals.',
  'CRM-native sync so every reply updates your pipeline instantly.',
  'Centralized governance for multi-inbox teams and agencies.'
];

const platformBlocks = [
  {
    tag: 'Command Center',
    title: 'See every campaign, sender, and outcome in one place.',
    description:
      'Track inbox health, engagement trends, and pipeline impact without jumping between tools.',
    bullets: ['Live engagement heatmaps', 'Sender-level deliverability scoring', 'Audience quality checks'],
    image: '/platform/campaign tracker.png',
    imagePosition: 'center top'
  },
  {
    tag: 'Campaign Studio',
    title: 'Launch multi-inbox campaigns with guardrails built in.',
    description:
      'Balance volume, timing, and personalization across teams while staying compliant.',
    bullets: ['Smart send windows', 'Sequence-level QA', 'Follow-up automation'],
    image: '/platform/create campaign.png',
    imagePosition: 'center top'
  },
  {
    tag: 'Template Library',
    title: 'Personalize at scale without losing your brand voice.',
    description:
      'Build templates once, then reuse across segments with dynamic tokens and approvals.',
    bullets: ['Role-based approvals', 'Reusable blocks', 'Performance-tested variants'],
    image: '/platform/template creation.png',
    imagePosition: 'center'
  },
  {
    tag: 'Prospect Lists',
    title: 'Build clean segments before every send.',
    description:
      'Organize prospects by persona, region, and intent so campaigns launch with the right audience.',
    bullets: ['Persona-based filters', 'List health indicators', 'CRM + CSV imports'],
    image: '/platform/prospect list.png',
    imagePosition: 'center top'
  }
];

const crmIntegrations = [
  'HubSpot',
  'Salesforce',
  'Pipedrive',
  'Zoho CRM',
  'Dynamics 365',
  'Freshsales',
  'Copper',
  'Close'
];

const apiFeatures = [
  'REST endpoints for campaigns, contacts, and sequences',
  'Event webhooks for opens, clicks, replies, and bounces',
  'Custom fields + segmentation sync from your data warehouse',
  'Bulk import/export with rate-limit controls'
];

const stories = [
  {
    company: 'Crescent Labs',
    metric: '+41%',
    result: 'reply rate in 60 days',
    quote:
      'We replaced three tools with EmailBridge Pro and finally got a single view of deliverability and pipeline.',
    role: 'Revenue Ops Director'
  },
  {
    company: 'Northwind Partners',
    metric: '2.8x',
    result: 'faster campaign launches',
    quote:
      'The sequence guardrails and CRM sync eliminated our manual handoffs overnight.',
    role: 'Growth Lead'
  },
  {
    company: 'Harbor Health',
    metric: '-32%',
    result: 'bounce rate reduction',
    quote:
      'Inbox health alerts helped us recover deliverability without slowing down outreach.',
    role: 'Head of Demand Gen'
  }
];

const LandingPage = () => {
  const [demoForm, setDemoForm] = useState({
    fullName: '',
    email: '',
    company: '',
    role: '',
    teamSize: '',
    crm: '',
    message: '',
    website: ''
  });
  const [demoStatus, setDemoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [demoError, setDemoError] = useState('');

  const handleDemoChange =
    (field: keyof typeof demoForm) =>
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      if (demoStatus !== 'loading') {
        setDemoStatus('idle');
        setDemoError('');
      }
      setDemoForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleDemoSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDemoError('');

    if (demoForm.website) {
      setDemoStatus('success');
      return;
    }

    if (!demoForm.fullName || !demoForm.email || !demoForm.company) {
      setDemoStatus('error');
      setDemoError('Please complete the required fields.');
      return;
    }

    setDemoStatus('loading');

    try {
      const { error } = await supabase.functions.invoke('book-demo', {
        body: {
          fullName: demoForm.fullName,
          email: demoForm.email,
          company: demoForm.company,
          role: demoForm.role,
          teamSize: demoForm.teamSize,
          crm: demoForm.crm,
          message: demoForm.message,
          website: demoForm.website
        }
      });

      if (error) {
        setDemoStatus('error');
        setDemoError('We could not send your request. Please try again.');
        return;
      }

      setDemoStatus('success');
      setDemoForm({
        fullName: '',
        email: '',
        company: '',
        role: '',
        teamSize: '',
        crm: '',
        message: '',
        website: ''
      });
    } catch (_) {
      setDemoStatus('error');
      setDemoError('We could not send your request. Please try again.');
    }
  };

  return (
    <div className="min-h-screen landing-theme bg-[color:var(--lp-bg)] text-[color:var(--lp-ink)] font-body">
      <Navbar />

      <main>
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,92,59,0.22),transparent_48%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(45,212,191,0.25),transparent_45%)]" />
            <div className="absolute inset-0 opacity-40 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:120px_120px]" />
          </div>

          <div className="container mx-auto px-4 relative z-10 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-[color:var(--lp-surface)] border border-[color:var(--lp-border)] text-xs uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">
                <span className="h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                Conversion-first outreach platform
              </div>

              <h1 className="mt-6 text-4xl md:text-6xl font-display font-semibold text-[color:var(--lp-ink-strong)] leading-tight">
                Turn outbound email into qualified pipeline, not guesswork.
              </h1>
              <p className="mt-6 text-lg md:text-xl text-[color:var(--lp-muted)] max-w-xl">
                Vintro.io unifies campaigns, inbox health, and CRM sync so your team can ship high-conversion sequences with confidence.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center gap-2 bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] font-semibold px-7 py-3 rounded-full shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition"
                >
                  Start free trial
                </Link>
                <a
                  href="#book-demo"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink-strong)] hover:border-[color:var(--lp-accent-2)] hover:text-[color:var(--lp-accent-2)] transition"
                >
                  Book a demo
                </a>
              </div>

              <div className="mt-6 text-sm text-[color:var(--lp-muted)]">
                14-day trial. No credit card required.
              </div>

              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="border-l border-[color:var(--lp-border)] pl-4 first:border-l-0 first:pl-0">
                    <div className="text-2xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                      {stat.value}
                    </div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--lp-muted)] mt-2">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="relative"
            >
              <div className="relative rounded-[32px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] shadow-[0_40px_120px_var(--lp-shadow)] overflow-hidden">
                <div className="h-10 bg-[color:var(--lp-bg-strong)] border-b border-[color:var(--lp-border)] flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff6b4a]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffb347]" />
                  <div className="w-3 h-3 rounded-full bg-[#2dd4bf]" />
                  <div className="ml-4 text-xs text-[color:var(--lp-muted)]">app.vintro.io</div>
                </div>
                <img
                  src="/platform/analytics dashboard.png"
                  alt="EmailBridge Pro analytics dashboard"
                  className="w-full h-auto object-cover"
                />
              </div>

              <div className="absolute -right-6 top-20 w-44 rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface-2)] shadow-[0_20px_50px_var(--lp-shadow)] overflow-hidden">
                <div className="px-4 py-3 text-xs text-[color:var(--lp-muted)] border-b border-[color:var(--lp-border)]">
                  Campaign overview
                </div>
                <img
                  src="/platform/campaign.png"
                  alt="Campaign overview screen"
                  className="w-full h-auto object-cover"
                />
              </div>

              <div className="absolute -left-8 bottom-10 w-52 rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface-2)] shadow-[0_20px_50px_var(--lp-shadow)] overflow-hidden">
                <div className="px-4 py-3 text-xs text-[color:var(--lp-muted)] border-b border-[color:var(--lp-border)]">
                  Inbox management
                </div>
                <img
                  src="/platform/inbox.png"
                  alt="Inbox management view"
                  className="w-full h-auto object-cover"
                />
              </div>

              <div className="absolute -bottom-10 right-10 rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-5 py-4 shadow-[0_20px_50px_var(--lp-shadow)]">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--lp-muted)]">CRM Sync</div>
                <div className="mt-2 text-lg font-display font-semibold text-[color:var(--lp-ink-strong)]">Live pipeline updates</div>
                <div className="mt-1 text-sm text-[color:var(--lp-muted)]">HubSpot + Salesforce connected</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* <section className="py-10 border-y border-[color:var(--lp-border)]">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">
              Trusted by growth teams at
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-8 text-lg font-display text-[color:var(--lp-ink)]">
              {logoStrip.map((logo) => (
                <span key={logo} className="opacity-70 hover:opacity-100 transition">
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section> */}

        <section id="solutions" className="py-24 bg-[color:var(--lp-card)] text-[color:var(--lp-card-ink)]">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-xs uppercase tracking-[0.4em] text-[#3f5c5a]">The problem</p>
              <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold">
                Revenue teams cannot scale outreach with fragmented tools.
              </h2>
              <p className="mt-4 text-lg text-[#3f5c5a] max-w-xl">
                Deliverability, personalization, and CRM updates drift when teams manage campaigns across disconnected systems.
              </p>
              <ul className="mt-8 space-y-4">
                {painPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[#1f3a37]">
                    <span className="mt-1 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-[32px] bg-[color:var(--lp-bg-strong)] text-[color:var(--lp-ink)] border border-[color:var(--lp-border)] p-10 shadow-[0_30px_80px_var(--lp-shadow)]"
            >
              <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Our USP</p>
              <h3 className="mt-4 text-2xl md:text-3xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                A conversion engine designed for modern outbound teams.
              </h3>
              <p className="mt-4 text-[color:var(--lp-muted)]">
                EmailBridge Pro blends deliverability intelligence with workflow automation so you can launch faster and convert more.
              </p>
              <ul className="mt-6 space-y-4">
                {uspPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-[color:var(--lp-accent-2)] mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center gap-2 bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] font-semibold px-6 py-3 rounded-full"
                >
                  See it in action
                </Link>
                <a
                  href="#book-demo"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink-strong)]"
                >
                  Talk to sales
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="platform" className="py-24 bg-[color:var(--lp-bg)]">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl"
            >
              <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Platform</p>
              <h2 className="mt-4 text-3xl md:text-5xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                Built to move from insights to action in minutes.
              </h2>
              <p className="mt-4 text-lg text-[color:var(--lp-muted)]">
                Every view is designed to keep campaign teams aligned, informed, and conversion-focused.
              </p>
            </motion.div>

            <div className="mt-12">
              {platformBlocks.map((block, index) => (
                <section
                  key={block.title}
                  className="sticky top-0 min-h-screen flex items-center bg-[color:var(--lp-bg)] border-t border-[color:var(--lp-border)] first:border-t-0 py-10 md:py-16"
                >
                  <div
                    className={`w-full grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-12 items-center ${
                      index % 2 === 1 ? 'lg:grid-cols-[1.05fr_1fr]' : ''
                    }`}
                  >
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ amount: 0.45, once: false }}
                    transition={{ duration: 0.6 }}
                    className={`${index % 2 === 1 ? 'lg:order-2' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">{block.tag}</p>
                      <span className="text-xs text-[color:var(--lp-muted)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl md:text-3xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                      {block.title}
                    </h3>
                    <p className="mt-4 text-lg text-[color:var(--lp-muted)]">{block.description}</p>
                    <div className="mt-6 flex flex-wrap gap-3 text-sm text-[color:var(--lp-ink)]">
                      {block.bullets.map((bullet) => (
                        <span
                          key={bullet}
                          className="px-3 py-2 rounded-full border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)]"
                        >
                          {bullet}
                        </span>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ amount: 0.45, once: false }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className={`${index % 2 === 1 ? 'lg:order-1' : ''}`}
                  >
                    <div className="rounded-[28px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] shadow-[0_40px_120px_var(--lp-shadow)] overflow-hidden">
                      <div className="h-9 bg-[color:var(--lp-bg-strong)] border-b border-[color:var(--lp-border)] flex items-center px-4 gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#ff6b4a]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffb347]" />
                        <div className="w-3 h-3 rounded-full bg-[#2dd4bf]" />
                      </div>
                      <div className="relative aspect-[16/10] overflow-hidden bg-[color:var(--lp-bg-strong)]">
                        <motion.img
                          src={block.image}
                          alt={block.title}
                          initial={{ scale: 1.18, y: 18 }}
                          whileInView={{ scale: 1, y: 0 }}
                          viewport={{ amount: 0.55, once: false }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{ objectPosition: block.imagePosition }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </motion.div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="py-24 bg-[color:var(--lp-bg-strong)]">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Integrations</p>
              <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                CRM sync that never misses a reply.
              </h2>
              <p className="mt-4 text-lg text-[color:var(--lp-muted)] max-w-xl">
                Two-way sync keeps your CRM, segmentation, and outreach data aligned in real time.
              </p>
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {crmIntegrations.map((crm) => (
                  <div
                    key={crm}
                    className="rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-5 text-sm font-medium text-[color:var(--lp-ink)]"
                  >
                    {crm}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3 text-sm text-[color:var(--lp-muted)]">
                <span className="h-2 w-2 rounded-full bg-[color:var(--lp-accent-2)]" />
                Add any CRM or data source with our integration team.
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-[28px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-8 shadow-[0_30px_80px_var(--lp-shadow)]"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] flex items-center justify-center">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">Feature Service API</p>
                  <h3 className="text-2xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                    Build custom workflows with our API.
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-[color:var(--lp-muted)]">
                Trigger campaigns, sync segments, and push outcomes back to your stack with a robust developer toolkit.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-[color:var(--lp-ink)]">
                {apiFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-[color:var(--lp-accent-2)] mt-1" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <button className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--lp-ink-strong)] text-[color:var(--lp-bg-strong)] px-5 py-2 font-semibold">
                  View API docs
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink)] px-5 py-2 font-semibold">
                  Talk to solutions
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        <AIWorkflowShowcase />

        <section id="stories" className="py-24 bg-[color:var(--lp-bg-strong)]">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Success stories</p>
                <h2 className="mt-4 text-3xl md:text-5xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                  Built for teams that measure impact, not just opens.
                </h2>
              </div>
              <div className="text-lg text-[color:var(--lp-muted)] max-w-md">
                Results from teams who unified outreach, deliverability, and CRM reporting in one place.
              </div>
            </motion.div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {stories.map((story) => (
                <motion.div
                  key={story.company}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                  className="rounded-3xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-7 shadow-[0_20px_60px_var(--lp-shadow)] flex flex-col"
                >
                  <div className="text-3xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                    {story.metric}
                  </div>
                  <div className="text-sm uppercase tracking-[0.3em] text-[color:var(--lp-muted)] mt-2">
                    {story.result}
                  </div>
                  <p className="mt-6 text-[color:var(--lp-ink)]">
                    "{story.quote}"
                  </p>
                  <div className="mt-6 text-sm text-[color:var(--lp-muted)]">
                    {/* {story.company} - {story.role} */}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="book-demo" className="py-24 bg-[color:var(--lp-card)] text-[color:var(--lp-card-ink)]">
          <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-xs uppercase tracking-[0.4em] text-[#3f5c5a]">Book a demo</p>
              <h2 className="mt-4 text-3xl md:text-5xl font-display font-semibold text-[#0f2426]">
                Let us map your outbound workflow and show you the lift.
              </h2>
              <p className="mt-4 text-lg text-[#3f5c5a] max-w-xl">
                A 30-minute walkthrough of your current stack, deliverability gaps, and the exact path to improve reply rates.
              </p>

              <div className="mt-8 space-y-4 text-[#1f3a37]">
                <div className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                  <span>Custom sequence strategy for your audience and inbox mix.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                  <span>CRM sync demo with HubSpot, Salesforce, and Pipedrive.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                  <span>Deliverability checklist and inbox health report.</span>
                </div>
              </div>

              <div className="mt-8 text-sm text-[#3f5c5a]">
                Demo requests are answered within 1 business day.
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-[32px] border border-[color:var(--lp-border-light)] bg-[color:var(--lp-bg-strong)] p-8 md:p-10 text-[color:var(--lp-ink)] shadow-[0_30px_80px_var(--lp-shadow)]"
            >
              <h3 className="text-2xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                Request your demo
              </h3>
              <p className="mt-2 text-sm text-[color:var(--lp-muted)]">
                Tell us about your team and we will tailor the walkthrough.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleDemoSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="text-sm">
                    Full name *
                    <input
                      type="text"
                      name="fullName"
                      value={demoForm.fullName}
                      onChange={handleDemoChange('fullName')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] placeholder:text-[color:var(--lp-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                      placeholder="Jordan Lee"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Work email *
                    <input
                      type="email"
                      name="email"
                      value={demoForm.email}
                      onChange={handleDemoChange('email')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] placeholder:text-[color:var(--lp-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                      placeholder="jordan@company.com"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Company *
                    <input
                      type="text"
                      name="company"
                      value={demoForm.company}
                      onChange={handleDemoChange('company')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] placeholder:text-[color:var(--lp-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                      placeholder="Northwind"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Role / title
                    <input
                      type="text"
                      name="role"
                      value={demoForm.role}
                      onChange={handleDemoChange('role')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] placeholder:text-[color:var(--lp-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                      placeholder="Revenue Operations"
                    />
                  </label>
                  <label className="text-sm">
                    Team size
                    <select
                      name="teamSize"
                      value={demoForm.teamSize}
                      onChange={handleDemoChange('teamSize')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                    >
                      <option value="">Select</option>
                      <option value="1-5">1-5</option>
                      <option value="6-15">6-15</option>
                      <option value="16-50">16-50</option>
                      <option value="51-200">51-200</option>
                      <option value="201+">201+</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Primary CRM
                    <select
                      name="crm"
                      value={demoForm.crm}
                      onChange={handleDemoChange('crm')}
                      className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)]"
                    >
                      <option value="">Select</option>
                      {crmIntegrations.map((crm) => (
                        <option key={crm} value={crm}>
                          {crm}
                        </option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  </label>
                </div>

                <label className="text-sm block">
                  What do you want to improve?
                  <textarea
                    name="message"
                    value={demoForm.message}
                    onChange={handleDemoChange('message')}
                    className="mt-2 w-full rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-3 text-[color:var(--lp-ink-strong)] placeholder:text-[color:var(--lp-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--lp-accent-2)] min-h-[120px]"
                    placeholder="Tell us about your pipeline goals or challenges."
                  />
                </label>

                <label className="hidden">
                  Website
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={demoForm.website}
                    onChange={handleDemoChange('website')}
                  />
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-xs text-[color:var(--lp-muted)]" aria-live="polite">
                    {demoStatus === 'success' && 'Thanks! We will reach out shortly.'}
                    {demoStatus === 'error' && demoError}
                    {demoStatus === 'loading' && 'Sending your request...'}
                  </div>
                  <button
                    type="submit"
                    disabled={demoStatus === 'loading'}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--lp-accent)] px-7 py-3 text-[color:var(--lp-bg-strong)] font-semibold shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    Request demo
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </section>

        <section className="py-24 bg-[color:var(--lp-bg)]">
          <div className="container mx-auto px-4">
            <div className="rounded-[32px] border border-[color:var(--lp-border)] bg-[radial-gradient(circle_at_20%_20%,rgba(255,92,59,0.22),transparent_50%),radial-gradient(circle_at_80%_20%,rgba(45,212,191,0.22),transparent_50%)] p-12 md:p-16 text-center shadow-[0_40px_120px_var(--lp-shadow)]">
              <h2 className="text-3xl md:text-5xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                Ready to launch your next high-conversion campaign?
              </h2>
              <p className="mt-4 text-lg text-[color:var(--lp-muted)] max-w-2xl mx-auto">
                Get a unified view of deliverability, personalization, and CRM outcomes in days, not months.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center gap-2 bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] font-semibold px-7 py-3 rounded-full shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition"
                >
                  Start free trial
                </Link>
                <a
                  href="#book-demo"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink-strong)] hover:border-[color:var(--lp-accent-2)] hover:text-[color:var(--lp-accent-2)] transition"
                >
                  Schedule a demo
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--lp-border)] bg-[color:var(--lp-bg-strong)]">
        <div className="container mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_1fr] gap-10 text-sm text-[color:var(--lp-muted)]">
          <div>
            <Logo
              textClassName="text-2xl text-[color:var(--lp-ink-strong)] font-display"
              accentClassName="text-[color:var(--lp-accent-2)]"
            />
            <p className="mt-4 max-w-xs">
              The conversion-first email platform built to connect campaigns, inbox health, and CRM outcomes.
            </p>
          </div>
          <div>
            <h4 className="text-[color:var(--lp-ink-strong)] font-semibold mb-4">Platform</h4>
            <ul className="space-y-2">
              <li>Campaigns</li>
              <li>Deliverability</li>
              <li>Templates</li>
              <li>Analytics</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[color:var(--lp-ink-strong)] font-semibold mb-4">Integrations</h4>
            <ul className="space-y-2">
              <li>HubSpot</li>
              <li>Salesforce</li>
              <li>Pipedrive</li>
              <li>API + Webhooks</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[color:var(--lp-ink-strong)] font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li>About</li>
              <li>Security</li>
              <li>Careers</li>
              <li>Contact</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[color:var(--lp-border)] py-6 text-center text-xs text-[color:var(--lp-muted)]">
          2026 EmailBridge Pro. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;



