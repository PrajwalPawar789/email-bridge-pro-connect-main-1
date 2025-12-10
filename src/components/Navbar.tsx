import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Logo from './Logo';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-[#020617]/80 backdrop-blur-md border-b border-slate-800 py-4' : 'bg-transparent py-6'
      }`}
    >
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link to="/">
          <Logo />
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Features</a>
          <a href="#pricing" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Pricing</a>
          <a href="#testimonials" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">Testimonials</a>
          <Link to="/auth" className="text-white font-medium hover:text-indigo-400 transition-colors">Sign In</Link>
          <Link 
            to="/auth" 
            className="bg-white text-slate-900 px-5 py-2.5 rounded-full font-semibold hover:bg-indigo-50 transition-colors text-sm"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden text-white"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 bg-[#020617] border-b border-slate-800 p-4 md:hidden flex flex-col gap-4 shadow-xl"
        >
          <a href="#features" className="text-slate-300 hover:text-white py-2">Features</a>
          <a href="#pricing" className="text-slate-300 hover:text-white py-2">Pricing</a>
          <Link to="/auth" className="text-slate-300 hover:text-white py-2">Sign In</Link>
          <Link to="/auth" className="bg-indigo-600 text-white py-3 rounded-lg text-center font-semibold">Get Started</Link>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default Navbar;
