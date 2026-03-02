import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";

const workflowHighlights = [
  "Native triggers for list enrollments, manual starts, and webhook events.",
  "Runner-ready blocks: send email, wait windows, conditions, A/B split, webhook, and exit.",
  "Execution paths keep CRM sync, alerts, and follow-up actions coordinated in real time.",
];

const workflowNodeChips = [
  "trigger",
  "send_email",
  "wait",
  "condition",
  "split",
  "webhook",
  "exit",
];

const workflowStats = [
  { label: "Trigger modes", value: "3" },
  { label: "Runtime nodes", value: "7" },
  { label: "Flow topology", value: "Multi-branch" },
];

const WorkflowArchitectureSection = () => {
  return (
    <section
      id="workflow"
      className="py-24 md:py-28 border-y border-[color:var(--lp-border)] bg-[var(--lp-bg-strong)] [background-image:radial-gradient(circle_at_14%_12%,rgba(255,92,59,0.1),transparent_42%),radial-gradient(circle_at_88%_86%,rgba(45,212,191,0.14),transparent_38%)]"
    >
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--lp-muted)]">
            Workflow Architecture
          </p>
          <h2 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-display font-semibold leading-[1.06] tracking-[-0.02em] text-[color:var(--lp-ink-strong)]">
            Built on the exact automation flow your team executes in production.
          </h2>
          <p className="mt-5 max-w-3xl text-base md:text-lg text-[color:var(--lp-muted)]">
            This visual mirrors your real builder: multiple entry triggers route through a central
            automation core, then branch into the execution blocks that drive outreach and CRM
            outcomes.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.06 }}
          className="mt-7 flex flex-wrap items-center gap-3"
        >
          {workflowStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-full border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] px-4 py-2"
            >
              <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--lp-muted)]">
                {stat.label}
              </span>
              <span className="ml-2 text-sm font-semibold text-[color:var(--lp-ink-strong)]">
                {stat.value}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="group mt-10 relative rounded-[34px] border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] p-3 md:p-6 lg:p-8 overflow-hidden shadow-[0_40px_120px_var(--lp-shadow)]"
        >
          <div className="absolute -left-28 top-8 h-72 w-72 rounded-full bg-[color:var(--lp-accent)]/15 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-[color:var(--lp-accent-2)]/20 blur-3xl" />
          <div className="relative z-10 mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-bg)]/45 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--lp-muted)]">
              Live orchestration map
            </p>
            <span className="inline-flex items-center gap-2 text-xs text-[color:var(--lp-accent-2)]">
              <span className="h-2 w-2 rounded-full bg-[color:var(--lp-accent-2)] shadow-[0_0_14px_var(--lp-accent-2)]" />
              Runner aligned
            </span>
          </div>
          <img
            src="/platform/workflow-automation-map.svg"
            alt="Automation workflow map showing trigger inputs flowing to core orchestration and action blocks like send email, wait, condition, split, webhook, and exit."
            loading="lazy"
            decoding="async"
            className="relative z-10 w-full h-auto rounded-[24px] border border-[color:var(--lp-border)] bg-[color:var(--lp-bg)] transition-transform duration-500 group-hover:scale-[1.008]"
          />
        </motion.div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {workflowHighlights.map((highlight, index) => (
            <motion.div
              key={highlight}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="rounded-2xl border border-[color:var(--lp-border)] bg-[color:var(--lp-surface-2)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.14)]"
            >
              <CheckCircle2 className="h-5 w-5 text-[color:var(--lp-accent-2)]" />
              <p className="mt-3 text-sm text-[color:var(--lp-ink)]">{highlight}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] text-xs uppercase tracking-[0.26em] text-[color:var(--lp-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--lp-accent-3)]" />
            Runtime blocks
          </span>
          {workflowNodeChips.map((chip) => (
            <span
              key={chip}
              className="px-3 py-1.5 rounded-full border border-[color:var(--lp-border)] bg-[color:var(--lp-surface)] text-xs font-mono text-[color:var(--lp-ink)]"
            >
              {chip}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default WorkflowArchitectureSection;
