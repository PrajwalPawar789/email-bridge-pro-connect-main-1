import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import LogoTicker from '../components/LogoTicker';
import ImmersivePlatformTour from '../components/ImmersivePlatformTour';
import BentoGrid from '../components/BentoGrid';
import Pricing from '../components/Pricing';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-indigo-500/30">
      <Navbar />
      
      <HeroSection />
      
      <LogoTicker />
      
      <ImmersivePlatformTour />
      
      <BentoGrid />
      
      <Pricing />

      {/* Final CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] to-indigo-950/20" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tight">
              Ready to Transform Your <br />
              <span className="text-indigo-400">Email Marketing?</span>
            </h2>
            <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto">
              Join thousands of marketers who are getting better results with EmailBridge Pro. Start your 14-day free trial today.
            </p>
            <Link 
              to="/auth"
              className="inline-block bg-white text-slate-900 font-bold py-4 px-12 rounded-full text-lg transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)]"
            >
              Get Started for Free
            </Link>
          </motion.div>
        </div>
      </section>
      
      <footer className="bg-[#020617] text-slate-400 py-12 border-t border-slate-800">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
              <span className="text-2xl font-bold text-white flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">E</span>
                </div>
                EmailBridge
              </span>
              <p className="text-sm leading-relaxed">
                The all-in-one platform for modern email marketing teams.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">© 2025 EmailBridge Pro. All rights reserved.</p>
            <div className="flex gap-6">
              {/* Social Icons could go here */}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
