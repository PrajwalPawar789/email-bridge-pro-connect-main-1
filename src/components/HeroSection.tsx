import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, PerspectiveCamera, Environment, Stars, Sparkles } from '@react-three/drei';
import { motion, useScroll, useTransform } from 'framer-motion';
import * as THREE from 'three';

// Reusing the abstract background elements
const NetworkSphere = (props: any) => {
  const mesh = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.getElapsedTime() * 0.05;
    }
  });
  return (
    <points ref={mesh} {...props}>
      <sphereGeometry args={[4, 64, 64]} />
      <pointsMaterial size={0.02} color="#6366f1" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
};

const HeroSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);
  const scale = useTransform(scrollY, [0, 500], [1, 0.9]);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#020617] overflow-hidden flex flex-col items-center pt-32">
      
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <NetworkSphere />
          </Float>
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          <Environment preset="city" />
        </Canvas>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center">
        <motion.div 
          style={{ opacity, y }}
          className="max-w-4xl mx-auto mb-16"
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-6 px-6 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-sm"
          >
            <span className="text-indigo-300 font-medium tracking-wide uppercase text-sm">
              The Future of Email Marketing
            </span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 mb-8 tracking-tight leading-tight"
          >
            Master Your Inbox <br />
            <span className="text-indigo-400">With Intelligence</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            The all-in-one platform for campaign management, advanced analytics, and seamless lead scheduling.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <button className="bg-white text-slate-900 font-bold py-4 px-10 rounded-full text-lg transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] hover:scale-105">
              Start Free Trial
            </button>
            <button className="bg-transparent border border-slate-600 text-white font-semibold py-4 px-10 rounded-full text-lg transition-all backdrop-blur-sm hover:bg-white/5">
              View Demo
            </button>
          </motion.div>
        </motion.div>

        {/* Hero Dashboard Screenshot with 3D Tilt */}
        <motion.div
          style={{ scale }}
          initial={{ opacity: 0, y: 100, rotateX: 20 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1, delay: 0.4, type: "spring", bounce: 0.2 }}
          className="relative w-full max-w-6xl mx-auto perspective-1000"
        >
          <div className="relative rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden group">
            {/* Browser Header */}
            <div className="h-10 bg-slate-800 flex items-center px-4 gap-2 border-b border-slate-700">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <div className="ml-4 flex-1 bg-slate-950/50 h-6 rounded text-xs text-slate-500 flex items-center px-3">
                emailbridge.pro/dashboard
              </div>
            </div>
            
            {/* Main Dashboard Image */}
            <img 
              src="/platform/screencapture-localhost-8080-dashboard-2025-12-08-00_27_19.png" 
              alt="EmailBridge Pro Dashboard" 
              className="w-full h-auto object-cover"
            />
            
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-20" />
          </div>
          
          {/* Glow Effect */}
          <div className="absolute -inset-10 bg-indigo-500/20 blur-[100px] -z-10 rounded-full opacity-50" />
        </motion.div>
      </div>
    </div>
  );
};

export default HeroSection;
