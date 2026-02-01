import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import Logo from '@/components/Logo';
import { fetchOnboardingStatus } from '@/lib/onboarding';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();

  const emailRedirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/auth`;
  }, []);

  useEffect(() => {
    const redirectAfterAuth = async (session: any) => {
      if (!session?.user) return;
      try {
        const status = await fetchOnboardingStatus(session.user.id);
        const target =
          status === 'completed' || status === 'skipped' ? '/dashboard' : '/onboarding';
        navigate(target);
      } catch {
        navigate('/dashboard');
      }
    };

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        redirectAfterAuth(session);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        redirectAfterAuth(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const markAwaitingVerification = (targetEmail: string) => {
    setAwaitingVerification(true);
    setVerificationEmail(targetEmail);
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) return;
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verificationEmail,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (error) throw error;
      toast({
        title: 'Verification email sent',
        description: `We sent a new verification link to ${verificationEmail}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Resend failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          const message = error.message?.toLowerCase() || '';
          if (message.includes('confirm') || message.includes('verify')) {
            markAwaitingVerification(email);
            toast({
              title: 'Verify your email',
              description: 'Please verify your email address before signing in.',
            });
            return;
          }
          throw error;
        }
        toast({
          title: "Success",
          description: "Logged in successfully!",
        });
      } else {
        // For signup, we'll automatically sign in the user after successful registration
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });
        if (error) throw error;
        
        const requiresVerification = !!data.user && !data.user.email_confirmed_at && !data.session;

        if (requiresVerification) {
          markAwaitingVerification(email);
          toast({
            title: "Check your email",
            description: "We sent you a verification link. Please verify to finish signing up.",
          });
        } else if (data.user && data.user.email_confirmed_at) {
          toast({
            title: "Success",
            description: "Account created and logged in successfully!",
          });
        } else {
          toast({
            title: "Account created",
            description: "Please check your inbox to verify your email before signing in.",
          });
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: emailRedirectTo ? { redirectTo: emailRedirectTo } : undefined,
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: 'Google sign-in failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left Side - Branding & Info */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&q=80')] opacity-10 bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 to-slate-800/90" />
        
        <div className="relative z-10">
          <div className="mb-4">
            <Logo />
          </div>
          <p className="text-slate-400">Advanced Email Campaign Management</p>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-bold leading-tight">
            Scale your outreach with confidence.
          </h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-400" />
              <span className="text-slate-300">Automated campaign sequences</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-400" />
              <span className="text-slate-300">Real-time analytics & tracking</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-400" />
              <span className="text-slate-300">Smart inbox management</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-500">
          © 2025 EmailBridge Pro. All rights reserved.
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {isLogin 
                ? 'Enter your credentials to access your account' 
                : 'Get started with your free account today'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            </div>

            {awaitingVerification && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-emerald-100 p-2 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-900">Verify your email to continue</p>
                    <p>
                      We sent a verification link to <span className="font-semibold">{verificationEmail}</span>.
                      Once verified, you can sign in right away.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                      >
                        {resendLoading ? 'Sending...' : 'Resend verification email'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setAwaitingVerification(false);
                          setVerificationEmail('');
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        Use a different email
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 bg-slate-900 hover:bg-slate-800" 
              disabled={loading}
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  {isLogin ? 'Sign in' : 'Create account'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 border-slate-200"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <div className="h-5 w-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M21.6 12.23c0-.74-.07-1.45-.2-2.13H12v4.04h5.36a4.58 4.58 0 0 1-1.98 3.01v2.5h3.2c1.87-1.72 3.02-4.26 3.02-7.42Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 22c2.7 0 4.96-.9 6.62-2.45l-3.2-2.5c-.9.6-2.05.96-3.42.96-2.62 0-4.84-1.77-5.63-4.15H3.06v2.6A10 10 0 0 0 12 22Z"
                    fill="#34A853"
                  />
                  <path
                    d="M6.37 13.86A6 6 0 0 1 6 12c0-.65.11-1.29.3-1.86V7.54H3.06A10 10 0 0 0 2 12c0 1.62.39 3.16 1.06 4.46l3.31-2.6Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 6.02c1.47 0 2.8.51 3.85 1.5l2.88-2.88C16.96 2.85 14.7 2 12 2A10 10 0 0 0 3.06 7.54l3.31 2.6C7.16 7.77 9.38 6.02 12 6.02Z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </span>
            )}
          </Button>

          <div className="text-center text-sm">
            <span className="text-slate-600">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-semibold text-blue-600 hover:text-blue-500 hover:underline"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
