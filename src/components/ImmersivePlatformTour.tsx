import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const features = [
  {
    id: "dashboard",
    title: "Command Center",
    description: "Get a bird's-eye view of your entire email operation. Track open rates, click-throughs, and domain health in real-time.",
    image: "/platform/screencapture-localhost-8080-dashboard-2025-12-08-00_27_19.png",
    color: "from-indigo-500/20 to-blue-500/20"
  },
  {
    id: "campaigns",
    title: "Campaign Management",
    description: "Manage multiple campaigns with ease. Monitor status, sent counts, and performance metrics at a glance.",
    image: "/platform/screencapture-localhost-8080-dashboard-2025-12-08-00_28_57.png",
    color: "from-purple-500/20 to-pink-500/20"
  },
  {
    id: "editor",
    title: "Visual Email Builder",
    description: "Craft beautiful, responsive emails with our intuitive editor. Personalize content dynamically for higher engagement.",
    image: "/platform/screencapture-localhost-8080-dashboard-2025-12-08-00_30_03.png",
    color: "from-emerald-500/20 to-teal-500/20"
  },
  {
    id: "templates",
    title: "Template Library",
    description: "Save time with reusable templates. Organize your designs and ensure brand consistency across all your communications.",
    image: "/platform/screencapture-localhost-8080-dashboard-2025-12-08-00_31_52.png",
    color: "from-orange-500/20 to-amber-500/20"
  }
];

const ImmersivePlatformTour = () => {
  // Force refresh
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  return (
    <section ref={containerRef} className="relative bg-[#020617]">
      {features.map((feature, index) => (
        <FeatureBlock key={feature.id} feature={feature} index={index} total={features.length} />
      ))}
    </section>
  );
};

const FeatureBlock = ({ feature, index, total }: { feature: typeof features[0], index: number, total: number }) => {
  return (
    <div className="min-h-screen flex items-center justify-center sticky top-0 overflow-hidden bg-[#020617] border-t border-slate-800/50">
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-10 blur-3xl`} />
      
      <div className="container mx-auto px-4 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center h-full py-20">
        
        {/* Text Content */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="order-2 lg:order-1"
        >
          <div className="flex items-center gap-4 mb-6">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white font-bold text-xl backdrop-blur-md">
              {index + 1}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            {feature.title}
          </h2>
          <p className="text-xl text-slate-300 leading-relaxed max-w-lg">
            {feature.description}
          </p>
        </motion.div>

        {/* Image Showcase */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
          whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="order-1 lg:order-2 perspective-1000"
        >
          <div className="relative rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden group transform transition-transform duration-500 hover:scale-[1.02]">
            {/* Browser Header */}
            <div className="h-8 bg-slate-800 flex items-center px-4 gap-2 border-b border-slate-700">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            
            {/* Image */}
            <div className="relative aspect-[16/10] bg-slate-950 flex items-center justify-center">
              <img 
                src={feature.image} 
                alt={feature.title} 
                className="w-full h-full object-cover object-top"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('bg-slate-800');
                  const fallback = document.createElement('div');
                  fallback.className = 'text-slate-500 text-sm font-medium';
                  fallback.innerText = 'Image not found: ' + feature.image;
                  e.currentTarget.parentElement?.appendChild(fallback);
                }}
              />
              
              {/* Overlay Gradient for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
          </div>
          
          {/* Reflection/Glow */}
          <div className={`absolute -inset-4 bg-gradient-to-r ${feature.color} blur-3xl -z-10 opacity-20`} />
        </motion.div>
      </div>
    </div>
  );
};

export default ImmersivePlatformTour;
