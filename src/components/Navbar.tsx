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
        isScrolled
          ? 'bg-[rgba(7,26,28,0.9)] backdrop-blur-md border-b border-[color:var(--lp-border)] shadow-[0_20px_40px_var(--lp-shadow)] py-4'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link to="/">
          <Logo
            textClassName="text-2xl text-[color:var(--lp-ink-strong)] font-display"
            accentClassName="text-[color:var(--lp-accent-2)]"
          />
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#solutions" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] transition-colors text-sm font-medium">Solutions</a>
          <a href="#platform" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] transition-colors text-sm font-medium">Platform</a>
          <a href="#integrations" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] transition-colors text-sm font-medium">Integrations</a>
          <a href="#features" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] transition-colors text-sm font-medium">Features</a>
          <a href="#stories" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] transition-colors text-sm font-medium">Stories</a>
          <Link to="/auth" className="text-[color:var(--lp-ink-strong)] font-medium hover:text-[color:var(--lp-accent-2)] transition-colors">Sign In</Link>
          <Link 
            to="/auth" 
            className="bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] px-5 py-2.5 rounded-full font-semibold hover:brightness-110 transition-all text-sm shadow-[0_12px_30px_rgba(255,92,59,0.25)]"
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
          className="absolute top-full left-0 right-0 bg-[color:var(--lp-bg)] border-b border-[color:var(--lp-border)] p-4 md:hidden flex flex-col gap-4 shadow-xl"
        >
          <a href="#solutions" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] py-2">Solutions</a>
          <a href="#platform" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] py-2">Platform</a>
          <a href="#integrations" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] py-2">Integrations</a>
          <a href="#features" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] py-2">Features</a>
          <a href="#stories" className="text-[color:var(--lp-muted)] hover:text-[color:var(--lp-ink-strong)] py-2">Stories</a>
          <Link to="/auth" className="text-[color:var(--lp-ink-strong)] hover:text-[color:var(--lp-accent-2)] py-2">Sign In</Link>
          <Link to="/auth" className="bg-[color:var(--lp-accent)] text-[color:var(--lp-bg-strong)] py-3 rounded-lg text-center font-semibold shadow-[0_10px_24px_rgba(255,92,59,0.25)]">Get Started</Link>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default Navbar;
