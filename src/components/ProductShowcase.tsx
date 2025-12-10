import React from 'react';
import { motion } from 'framer-motion';

const ProductShowcase = () => {
  return (
    <section className="py-24 bg-slate-950 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-bold text-white mb-4"
          >
            Powerful Features, <span className="text-indigo-400">Beautifully Designed</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-slate-400 text-lg max-w-2xl mx-auto"
          >
            Experience a workspace that adapts to your needs. From campaign creation to deep analytics, everything is just a click away.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, rotateX: 20, y: 100 }}
          whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, type: "spring", bounce: 0.2 }}
          style={{ perspective: "1000px" }}
          className="relative mx-auto max-w-6xl"
        >
          {/* Browser Window Frame */}
          <div className="relative rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            {/* Window Controls */}
            <div className="h-10 bg-slate-800/50 border-b border-slate-700 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <div className="ml-4 flex-1 bg-slate-950/50 h-6 rounded text-xs text-slate-500 flex items-center px-3">
                emailbridge.pro/dashboard
              </div>
            </div>

            {/* Dashboard Content Mockup */}
            <div className="p-6 grid grid-cols-12 gap-6 bg-slate-950">
              {/* Sidebar */}
              <div className="col-span-2 hidden md:block space-y-4">
                <div className="h-8 w-8 bg-indigo-600 rounded-lg mb-8" />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-2 w-full bg-slate-800 rounded animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>

              {/* Main Content */}
              <div className="col-span-12 md:col-span-10 space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                  <div className="h-8 w-48 bg-slate-800 rounded" />
                  <div className="flex gap-2">
                    <div className="h-8 w-8 bg-slate-800 rounded-full" />
                    <div className="h-8 w-8 bg-slate-800 rounded-full" />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                      <div className="h-4 w-24 bg-slate-800 rounded mb-2" />
                      <div className="h-8 w-16 bg-indigo-500/20 rounded" />
                    </div>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="h-64 bg-slate-900 rounded-lg border border-slate-800 p-4 flex items-end gap-2">
                  {[40, 60, 45, 70, 50, 80, 65, 85, 75, 90, 60, 70].map((h, i) => (
                    <motion.div 
                      key={i}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${h}%` }}
                      transition={{ duration: 1, delay: i * 0.05 }}
                      className="flex-1 bg-gradient-to-t from-indigo-600 to-purple-500 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Glass Overlay Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
          </div>
          
          {/* Glow Effect behind */}
          <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl -z-10 rounded-[3rem]" />
        </motion.div>
      </div>
    </section>
  );
};

export default ProductShowcase;
