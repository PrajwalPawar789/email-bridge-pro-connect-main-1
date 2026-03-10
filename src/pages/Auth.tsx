import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import Logo from '@/components/Logo';
import { fetchOnboardingStatus } from '@/lib/onboarding';
import {
  captureReferralCodeFromSearch,
  claimReferralForUser,
  clearPendingReferralClaimReady,
  clearPendingReferralCode,
  isPendingReferralClaimReady,
  markPendingReferralClaimReady,
  persistPendingReferralCode,
  readPendingReferralCode,
} from '@/lib/referrals';

type AuthView = 'login' | 'signup' | 'forgot' | 'password-setup';
type PasswordSetupFlow = 'invite' | 'recovery';

const clearAuthHash = () => {
  if (typeof window === 'undefined') return;
  const base = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, base);
};

const resolvePasswordSetupFlow = (search: string, hash: string): PasswordSetupFlow | null => {
  const searchParams = new URLSearchParams(search);
  const searchMode = String(searchParams.get('mode') || '').trim().toLowerCase();
  if (searchMode === 'invite' || searchMode === 'recovery') {
    return searchMode as PasswordSetupFlow;
  }

  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!normalizedHash) return null;

  const hashParams = new URLSearchParams(normalizedHash);
  const hashMode = String(hashParams.get('type') || '').trim().toLowerCase();
  if (hashMode === 'invite' || hashMode === 'recovery') {
    return hashMode as PasswordSetupFlow;
  }

  return null;
};

const Auth = () => {
  const [authView, setAuthView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotEmailSentTo, setForgotEmailSentTo] = useState('');
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(() => readPendingReferralCode());
  const [passwordSetupFlow, setPasswordSetupFlow] = useState<PasswordSetupFlow | null>(null);
  const [passwordSetupEmail, setPasswordSetupEmail] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const passwordSetupFlowRef = useRef<PasswordSetupFlow | null>(null);
  const redirectingRef = useRef(false);

  const emailRedirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/auth`;
  }, []);

  const recoveryRedirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}/auth?mode=recovery`;
  }, []);

  const referralCodeFromUrl = useMemo(
    () => captureReferralCodeFromSearch(location.search),
    [location.search]
  );

  const activatePasswordSetup = useCallback((flow: PasswordSetupFlow, nextEmail = '') => {
    passwordSetupFlowRef.current = flow;
    setPasswordSetupFlow(flow);
    setPasswordSetupEmail(nextEmail);
    setAuthView('password-setup');
    setAwaitingVerification(false);
    setVerificationEmail('');
    setForgotEmailSentTo('');
  }, []);

  const clearPasswordSetup = useCallback(() => {
    passwordSetupFlowRef.current = null;
    setPasswordSetupFlow(null);
    setPasswordSetupEmail('');
    setPassword('');
    setConfirmPassword('');
  }, []);

  const switchAuthView = useCallback((nextView: AuthView) => {
    setAuthView(nextView);
    setAwaitingVerification(false);
    setVerificationEmail('');
    if (nextView !== 'forgot') {
      setForgotEmailSentTo('');
    }
    if (nextView !== 'password-setup') {
      setPassword('');
      setConfirmPassword('');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rawHash = window.location.hash?.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash || '';
    if (!rawHash) return;

    const params = new URLSearchParams(rawHash);
    const callbackError = params.get('error_description') || params.get('error');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const flow = resolvePasswordSetupFlow(window.location.search, window.location.hash);

    if (callbackError) {
      let callbackMessage = String(callbackError).replace(/\+/g, ' ');
      try {
        callbackMessage = decodeURIComponent(callbackMessage);
      } catch {
        // Keep raw callback text if decoding fails.
      }
      toast({
        title: 'Verification failed',
        description: callbackMessage,
        variant: 'destructive',
      });
      clearAuthHash();
      return;
    }

    if (flow) {
      activatePasswordSetup(flow);
    }

    if (!accessToken || !refreshToken) return;

    let canceled = false;
    (async () => {
      const { data: currentSession } = await supabase.auth.getSession();
      if (canceled) return;

      if (currentSession.session) {
        if (flow) {
          activatePasswordSetup(flow, currentSession.session.user.email || '');
        }
        clearAuthHash();
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!canceled && error) {
        toast({
          title: 'Verification failed',
          description: error.message,
          variant: 'destructive',
        });
      }

      if (!canceled) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (flow && session?.user) {
          activatePasswordSetup(flow, session.user.email || '');
        }
        clearAuthHash();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [activatePasswordSetup]);

  useEffect(() => {
    if (!referralCodeFromUrl) return;
    persistPendingReferralCode(referralCodeFromUrl);
    setPendingReferralCode(referralCodeFromUrl);
  }, [referralCodeFromUrl]);

  const redirectAfterAuth = useCallback(
    async (session: any) => {
      if (!session?.user || redirectingRef.current) return;
      if (passwordSetupFlowRef.current) {
        setPasswordSetupEmail(session.user.email || '');
        setAuthView('password-setup');
        return;
      }

      redirectingRef.current = true;
      try {
        const tryClaimPendingReferral = async () => {
          const isClaimReady = isPendingReferralClaimReady();
          if (!isClaimReady) {
            clearPendingReferralCode();
            setPendingReferralCode(null);
            return;
          }

          const referralCode = pendingReferralCode || readPendingReferralCode();
          if (!referralCode) {
            clearPendingReferralClaimReady();
            return;
          }

          const createdAtMs = Date.parse(String(session.user.created_at || ''));
          const isFreshAccount =
            Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= 1000 * 60 * 60 * 24;

          if (!isFreshAccount) {
            clearPendingReferralClaimReady();
            clearPendingReferralCode();
            setPendingReferralCode(null);
            return;
          }

          try {
            const result = await claimReferralForUser(referralCode, session.user.id);
            if (result.linked) {
              toast({
                title: 'Referral tracked',
                description: 'Your signup was linked to the referral code.',
              });
            }
          } catch (error) {
            console.error('Failed to claim referral code:', error);
          } finally {
            clearPendingReferralClaimReady();
            clearPendingReferralCode();
            setPendingReferralCode(null);
          }
        };

        await tryClaimPendingReferral();

        try {
          const status = await fetchOnboardingStatus(session.user.id);
          const target =
            status === 'completed' || status === 'skipped' ? '/dashboard' : '/onboarding';
          navigate(target);
        } catch {
          navigate('/dashboard');
        }
      } finally {
        redirectingRef.current = false;
      }
    },
    [navigate, pendingReferralCode]
  );

  useEffect(() => {
    let mounted = true;
    const callbackFlow = resolvePasswordSetupFlow(location.search, location.hash);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || !session) return;
      if (callbackFlow) {
        activatePasswordSetup(callbackFlow, session.user.email || '');
        return;
      }
      if (passwordSetupFlowRef.current) {
        setPasswordSetupEmail(session.user.email || '');
        setAuthView('password-setup');
        return;
      }
      void redirectAfterAuth(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        activatePasswordSetup('recovery', session.user.email || '');
        return;
      }

      if (!session?.user) return;

      if (passwordSetupFlowRef.current) {
        setPasswordSetupEmail(session.user.email || '');
        setAuthView('password-setup');
        return;
      }

      window.setTimeout(() => {
        if (!mounted) return;
        void redirectAfterAuth(session);
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [activatePasswordSetup, location.hash, location.search, redirectAfterAuth]);

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

  const handleCredentialAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (authView === 'login') {
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
          title: 'Success',
          description: 'Logged in successfully!',
        });
        return;
      }

      const signUpOptions: Record<string, any> = emailRedirectTo ? { emailRedirectTo } : {};
      if (pendingReferralCode) {
        signUpOptions.data = { referral_code: pendingReferralCode };
      }

      let { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: signUpOptions,
      });

      if (
        error &&
        pendingReferralCode &&
        /database error saving new user/i.test(String(error.message || ''))
      ) {
        const fallbackOptions: Record<string, any> = emailRedirectTo ? { emailRedirectTo } : {};
        const fallbackResult = await supabase.auth.signUp({
          email,
          password,
          options: fallbackOptions,
        });
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) throw error;

      if (pendingReferralCode) {
        markPendingReferralClaimReady();
      }

      const requiresVerification = !!data.user && !data.user.email_confirmed_at && !data.session;

      if (requiresVerification) {
        markAwaitingVerification(email);
        toast({
          title: 'Check your email',
          description: 'We sent you a verification link. Please verify to finish signing up.',
        });
      } else if (data.user && data.user.email_confirmed_at) {
        toast({
          title: 'Success',
          description: 'Account created and logged in successfully!',
        });
      } else {
        toast({
          title: 'Account created',
          description: 'Please check your inbox to verify your email before signing in.',
        });
        switchAuthView('login');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectTo,
      });
      if (error) throw error;

      setForgotEmailSentTo(email);
      toast({
        title: 'Reset link sent',
        description: `We sent a password reset link to ${email}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Unable to send reset link',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSetup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Use at least 6 characters.',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Re-enter the same password in both fields.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      clearPasswordSetup();
      toast({
        title: passwordSetupFlow === 'invite' ? 'Password created' : 'Password updated',
        description:
          passwordSetupFlow === 'invite'
            ? 'Your account is ready to use.'
            : 'You can now sign in with your new password.',
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await redirectAfterAuth(session);
      } else {
        switchAuthView('login');
      }
    } catch (error: any) {
      toast({
        title: 'Password update failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      if (pendingReferralCode) {
        markPendingReferralClaimReady();
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: emailRedirectTo ? { redirectTo: emailRedirectTo } : undefined,
      });
      if (error) throw error;
    } catch (error: any) {
      clearPendingReferralClaimReady();
      toast({
        title: 'Google sign-in failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleExitPasswordSetup = async () => {
    clearPasswordSetup();
    await supabase.auth.signOut();
    switchAuthView('login');
    navigate('/auth', { replace: true });
  };

  const title =
    authView === 'signup'
      ? 'Create an account'
      : authView === 'forgot'
      ? 'Forgot password'
      : authView === 'password-setup'
      ? passwordSetupFlow === 'invite'
        ? 'Create your password'
        : 'Reset your password'
      : 'Welcome back';

  const description =
    authView === 'signup'
      ? 'Get started with your free account today'
      : authView === 'forgot'
      ? 'Enter your email and we will send you a reset link'
      : authView === 'password-setup'
      ? passwordSetupFlow === 'invite'
        ? 'Finish accepting your workspace invitation by setting a password.'
        : 'Choose a new password for your account.'
      : 'Enter your credentials to access your account';

  const submitLabel =
    authView === 'signup'
      ? 'Create account'
      : authView === 'forgot'
      ? 'Send reset link'
      : authView === 'password-setup'
      ? passwordSetupFlow === 'invite'
        ? 'Create password'
        : 'Update password'
      : 'Sign in';

  const showCredentialPassword = authView === 'login' || authView === 'signup';
  const showPasswordSetup = authView === 'password-setup';
  const showGoogleAuth = authView === 'login' || authView === 'signup';

  return (
    <div className="min-h-screen w-full flex">
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
          © 2026 EmailBridge Pro. All rights reserved.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>

          {pendingReferralCode && authView === 'signup' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Referral code <span className="font-semibold">{pendingReferralCode}</span> will be applied after signup.
            </div>
          )}

          {forgotEmailSentTo && authView === 'forgot' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Reset instructions were sent to <span className="font-semibold">{forgotEmailSentTo}</span>.
            </div>
          )}

          {showPasswordSetup && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {passwordSetupEmail ? (
                <>
                  Updating password for <span className="font-semibold">{passwordSetupEmail}</span>.
                </>
              ) : (
                'Create a password to finish this secure sign-in flow.'
              )}
            </div>
          )}

          <form
            onSubmit={
              authView === 'forgot'
                ? handleForgotPassword
                : authView === 'password-setup'
                ? handlePasswordSetup
                : handleCredentialAuth
            }
            className="space-y-6"
          >
            <div className="space-y-4">
              {!showPasswordSetup && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {(showCredentialPassword || showPasswordSetup) && (
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {showPasswordSetup ? 'New password' : 'Password'}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              )}

              {showPasswordSetup && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              )}
            </div>

            {authView === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchAuthView('forgot')}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-500 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

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
                  {submitLabel}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          {showGoogleAuth && (
            <>
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
            </>
          )}

          <div className="text-center text-sm">
            {authView === 'password-setup' ? (
              <button
                onClick={() => void handleExitPasswordSetup()}
                className="font-semibold text-blue-600 hover:text-blue-500 hover:underline"
              >
                Sign out instead
              </button>
            ) : authView === 'forgot' ? (
              <>
                <span className="text-slate-600">Remembered your password? </span>
                <button
                  onClick={() => switchAuthView('login')}
                  className="font-semibold text-blue-600 hover:text-blue-500 hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-600">
                  {authView === 'login' ? "Don't have an account? " : 'Already have an account? '}
                </span>
                <button
                  onClick={() => switchAuthView(authView === 'login' ? 'signup' : 'login')}
                  className="font-semibold text-blue-600 hover:text-blue-500 hover:underline"
                >
                  {authView === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
