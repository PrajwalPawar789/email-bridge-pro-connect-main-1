import React from 'react';
import { motion } from 'framer-motion';

const logos = [
  "Hostinger", "Shopify", "Slack", "Discord", "Linear", "Raycast", "Vercel", "Stripe"
];

const LogoTicker = () => {
  return (
    <section className="py-10 bg-[#020617] border-y border-slate-800 overflow-hidden">
      <div className="container mx-auto px-4 mb-8 text-center">
        <p className="text-sm text-slate-500 font-medium uppercase tracking-widest">Trusted by innovative teams</p>
      </div>
      
      <div className="flex overflow-hidden relative">
        {/* Gradient Masks */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#020617] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#020617] to-transparent z-10" />

        <motion.div 
          className="flex gap-16 items-center whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ 
            repeat: Infinity, 
            ease: "linear", 
            duration: 20 
          }}
        >
          {[...logos, ...logos].map((logo, index) => (
            <div key={index} className="text-2xl font-bold text-slate-600 hover:text-slate-400 transition-colors cursor-default">
              {logo}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default LogoTicker;
