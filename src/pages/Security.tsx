import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, Server, Users } from 'lucide-react';
import MarketingFooter from '../components/marketing/MarketingFooter';
import MarketingNavbar from '../components/marketing/MarketingNavbar';

const pillars = [
  {
    title: 'Data protection',
    description: 'Encryption in transit and at rest, plus automated key rotation policies.',
    icon: Lock
  },
  {
    title: 'Secure infrastructure',
    description: 'Hardened cloud environments with continuous monitoring and alerting.',
    icon: Server
  },
  {
    title: 'Access controls',
    description: 'Role-based permissions, SSO, and audit trails for every action.',
    icon: Users
  },
  {
    title: 'Incident readiness',
    description: 'Playbooks, drills, and rapid response timelines for critical events.',
    icon: ShieldCheck
  }
];

const lifecycle = [
  {
    title: 'Collect',
    detail: 'Only what is needed to run campaigns and sync CRM outcomes.'
  },
  {
    title: 'Process',
    detail: 'Segment, enrich, and personalize using secure, scoped workflows.'
  },
  {
    title: 'Store',
    detail: 'Encrypted databases with strict access boundaries.'
  },
  {
    title: 'Delete',
    detail: 'Retention controls and customer-managed deletion requests.'
  }
];

const compliance = [
  'SOC 2 Type II aligned controls',
  'GDPR-ready data processing agreements',
  'Regional data residency options for enterprise plans',
  'Annual penetration testing and remediation reviews'
];

const faqs = [
  {
    question: 'How do you handle customer data?',
    answer: 'We minimize data collection, encrypt sensitive fields, and restrict access by role and purpose.'
  },
  {
    question: 'Do you support SSO?',
    answer: 'Yes. Enterprise plans include SSO, SCIM provisioning, and advanced audit logs.'
  },
  {
    question: 'Can we review security documentation?',
    answer: 'Security briefings and trust documentation are available under NDA.'
  }
];

const Security = () => (
  <div className="min-h-screen landing-theme bg-[color:var(--lp-bg)] text-[color:var(--lp-ink)] font-body">
    <MarketingNavbar />

    <main>
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(45,212,191,0.2),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(255,92,59,0.2),transparent_55%)]" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Security</p>
            <h1 className="mt-4 text-4xl md:text-6xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Trust and safety built into every workflow.
            </h1>
            <p className="mt-6 text-lg text-[color:var(--lp-muted)] max-w-2xl">
              EmailBridge Pro protects customer data with layered controls, continuous monitoring, and transparent processes.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] font-semibold px-7 py-3 rounded-full shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition"
              >
                Talk to security
              </Link>
              <Link
                to="/company"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink-strong)] hover:border-[color:var(--lp-accent-2)] hover:text-[color:var(--lp-accent-2)] transition"
              >
                Company overview
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Security pillars</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Defense-in-depth for your outreach data.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="rounded-3xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-7"
                >
                  <div className="h-12 w-12 rounded-2xl bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] flex items-center justify-center">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-[color:var(--lp-muted)]">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[color:var(--lp-bg-strong)]">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Data lifecycle</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Clear, traceable handling of customer data.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-6">
            {lifecycle.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface-2)] p-6"
              >
                <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">{item.title}</div>
                <p className="mt-3 text-[color:var(--lp-ink)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Compliance</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Governance that scales with enterprise teams.
            </h2>
            <p className="mt-4 text-[color:var(--lp-muted)] max-w-xl">
              Our controls align with recognized frameworks, and we provide evidence packages to support your internal reviews.
            </p>
          </div>
          <div className="rounded-[28px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-8">
            <ul className="space-y-3 text-[color:var(--lp-ink)]">
              {compliance.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent-2)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-20 bg-[color:var(--lp-card)] text-[color:var(--lp-card-ink)]">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[#3f5c5a]">FAQs</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[#0f2426]">
              Answers to common security questions.
            </h2>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-3xl border border-[color:var(--lp-border-light)] bg-white/80 p-6 shadow-[0_25px_60px_rgba(10,20,20,0.12)]"
              >
                <h3 className="text-lg font-display font-semibold text-[#0f2426]">{faq.question}</h3>
                <p className="mt-3 text-sm text-[#3f5c5a]">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[color:var(--lp-bg-strong)]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
            Need a security review?
          </h2>
          <p className="mt-4 text-[color:var(--lp-muted)] max-w-2xl mx-auto">
            Our trust team can share documentation and answer architecture questions for your stakeholders.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] font-semibold px-7 py-3 rounded-full shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition"
            >
              Request a briefing
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-[color:var(--lp-border)] text-[color:var(--lp-ink-strong)] hover:border-[color:var(--lp-accent-2)] hover:text-[color:var(--lp-accent-2)] transition"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>
    </main>

    <MarketingFooter />
  </div>
);

export default Security;
