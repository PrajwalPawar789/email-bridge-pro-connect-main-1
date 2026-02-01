import { Link } from 'react-router-dom';
import MarketingFooter from '../components/marketing/MarketingFooter';
import MarketingNavbar from '../components/marketing/MarketingNavbar';

const timeline = [
  {
    year: '2021',
    title: 'Founded by revenue operators',
    description: 'Built to replace manual spreadsheets and disconnected tools.'
  },
  {
    year: '2022',
    title: 'First 200 teams onboarded',
    description: 'Scaled multi-inbox orchestration and deliverability insights.'
  },
  {
    year: '2024',
    title: 'Automation engine launched',
    description: 'Added real-time CRM updates and campaign guardrails.'
  },
  {
    year: '2026',
    title: 'Global expansion',
    description: 'Deeper security, AI sequencing, and 24/5 support coverage.'
  }
];

const beliefs = [
  {
    title: 'Respect the prospect',
    description: 'Personalization and pacing matter more than raw volume.'
  },
  {
    title: 'Make the next action obvious',
    description: 'We design with Hick\'s Law in mind to reduce decision fatigue.'
  },
  {
    title: 'Anchor trust with proof',
    description: 'Dashboards connect actions to pipeline outcomes and ROI.'
  }
];

const impactStats = [
  { label: 'Average reply lift', value: '3.4x' },
  { label: 'Bounce reduction', value: '32%' },
  { label: 'Time to launch', value: '2.1x faster' }
];

const About = () => (
  <div className="min-h-screen landing-theme bg-[color:var(--lp-bg)] text-[color:var(--lp-ink)] font-body">
    <MarketingNavbar />

    <main>
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,92,59,0.18),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(45,212,191,0.22),transparent_55%)]" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">About</p>
            <h1 className="mt-4 text-4xl md:text-6xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Built for teams who need certainty, not guesswork.
            </h1>
            <p className="mt-6 text-lg text-[color:var(--lp-muted)] max-w-2xl">
              EmailBridge Pro was created to help modern revenue teams orchestrate outreach with clarity, speed, and measurable impact.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {impactStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-6">
                <div className="text-2xl font-display font-semibold text-[color:var(--lp-ink-strong)]">{stat.value}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-[color:var(--lp-muted)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Our story</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              We listened to revenue teams that wanted fewer tools and better outcomes.
            </h2>
            <p className="mt-4 text-[color:var(--lp-muted)] max-w-xl">
              The platform merges deliverability, personalization, and CRM feedback loops so teams can launch faster and protect their brand reputation.
            </p>
            <p className="mt-4 text-[color:var(--lp-muted)] max-w-xl">
              Our design approach focuses on clear hierarchy, larger hit targets, and immediate feedback to keep decision flow effortless.
            </p>
          </div>
          <div className="rounded-[28px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-8">
            <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">Why teams choose us</p>
            <ul className="mt-4 space-y-3 text-[color:var(--lp-ink)]">
              <li className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                Unified inbox health, sequencing, and CRM updates in one workspace.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                Guardrails that protect deliverability without slowing launches.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[color:var(--lp-accent)]" />
                Real-time reporting that ties activity to pipeline impact.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-20 bg-[color:var(--lp-bg-strong)]">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">What we believe</p>
            <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
              Design principles that keep teams focused.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {beliefs.map((belief) => (
              <div key={belief.title} className="rounded-3xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-7">
                <h3 className="text-xl font-display font-semibold text-[color:var(--lp-ink-strong)]">{belief.title}</h3>
                <p className="mt-3 text-[color:var(--lp-muted)]">{belief.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">Timeline</p>
          <h2 className="mt-4 text-3xl md:text-4xl font-display font-semibold text-[color:var(--lp-ink-strong)]">
            Progress built on customer feedback.
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {timeline.map((item) => (
              <div key={item.year} className="rounded-3xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface-2)] p-7">
                <div className="text-sm uppercase tracking-[0.3em] text-[color:var(--lp-muted)]">{item.year}</div>
                <h3 className="mt-3 text-xl font-display font-semibold text-[color:var(--lp-ink-strong)]">{item.title}</h3>
                <p className="mt-3 text-[color:var(--lp-muted)]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[color:var(--lp-card)] text-[color:var(--lp-card-ink)]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-[#0f2426]">
            Meet the team or see the platform.
          </h2>
          <p className="mt-4 text-[#3f5c5a] max-w-2xl mx-auto">
            Learn how our operators, designers, and engineers build experiences that respect attention and drive outcomes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/company"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-[color:var(--lp-border-light)] text-[#0f2426] hover:border-[#2dd4bf] hover:text-[#2dd4bf] transition"
            >
              Company overview
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 bg-[#ff5c3b] text-[#051214] font-semibold px-7 py-3 rounded-full shadow-[0_18px_40px_rgba(255,92,59,0.3)] hover:brightness-110 transition"
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

export default About;
