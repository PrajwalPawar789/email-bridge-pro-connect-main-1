import React from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Shield, BarChart, Users, Globe } from 'lucide-react';

const features = [
  {
    title: "Smart Automation",
    description: "Set up complex drip campaigns with a visual builder. Trigger emails based on user behavior.",
    icon: Zap,
    colSpan: "col-span-1 md:col-span-2",
    bg: "bg-gradient-to-br from-indigo-500/10 to-purple-500/10"
  },
  {
    title: "Global Deliverability",
    description: "Our infrastructure ensures your emails hit the inbox, worldwide.",
    icon: Globe,
    colSpan: "col-span-1",
    bg: "bg-slate-900"
  },
  {
    title: "Team Collaboration",
    description: "Work together on templates and campaigns with role-based access control.",
    icon: Users,
    colSpan: "col-span-1",
    bg: "bg-slate-900"
  },
  {
    title: "Deep Analytics",
    description: "Real-time tracking of opens, clicks, and conversions with heatmaps.",
    icon: BarChart,
    colSpan: "col-span-1 md:col-span-2",
    bg: "bg-gradient-to-br from-blue-500/10 to-cyan-500/10"
  },
  {
    title: "Enterprise Security",
    description: "SOC2 compliant, GDPR ready, and end-to-end encryption for your data.",
    icon: Shield,
    colSpan: "col-span-1 md:col-span-3",
    bg: "bg-slate-900 border-indigo-500/30"
  }
];

const BentoGrid = () => {
  return (
    <section className="py-24 bg-[#020617]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Everything You Need</h2>
          <p className="text-slate-400 text-lg">Built for modern marketing teams.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`${feature.colSpan} ${feature.bg} p-8 rounded-3xl border border-slate-800 hover:border-slate-600 transition-colors group relative overflow-hidden`}
            >
              <div className="relative z-10">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="text-indigo-400 w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
              
              {/* Hover Glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BentoGrid;
