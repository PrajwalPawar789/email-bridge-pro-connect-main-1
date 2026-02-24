import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Home,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBillingSnapshot, normalizePlanId, type BillingSnapshot } from '@/lib/billing';

type ProfileSnapshot = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  designation: string;
  location: string;
  homeAddress: string;
  workAddress: string;
  billingAddress: string;
  linkedinUrl: string;
  xUrl: string;
  avatarUrl: string | null;
};

type PlanPalette = {
  badgeClass: string;
  meterClass: string;
  glowClass: string;
};

const PLAN_PALETTES: Record<'free' | 'growth' | 'scale' | 'enterprise', PlanPalette> = {
  free: {
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
    meterClass: 'from-slate-400 via-slate-500 to-slate-600',
    glowClass: 'bg-slate-300/45',
  },
  growth: {
    badgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    meterClass: 'from-emerald-400 via-emerald-500 to-teal-500',
    glowClass: 'bg-emerald-300/45',
  },
  scale: {
    badgeClass: 'border-sky-200 bg-sky-100 text-sky-700',
    meterClass: 'from-sky-400 via-blue-500 to-indigo-500',
    glowClass: 'bg-sky-300/45',
  },
  enterprise: {
    badgeClass: 'border-amber-200 bg-amber-100 text-amber-700',
    meterClass: 'from-amber-400 via-orange-500 to-rose-500',
    glowClass: 'bg-amber-300/45',
  },
};

const formatReadableDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const normalizeStatusLabel = (value: string | null | undefined) =>
  String(value || 'active')
    .split('_')
    .map((chunk) => (chunk ? `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}` : ''))
    .join(' ');

const Profile = () => {
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingBillingSnapshot, setLoadingBillingSnapshot] = useState(false);
  const [billingSnapshot, setBillingSnapshot] = useState<BillingSnapshot | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [designation, setDesignation] = useState('');
  const [location, setLocation] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileBaseline, setProfileBaseline] = useState<ProfileSnapshot | null>(null);

  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const applySnapshot = useCallback((snapshot: ProfileSnapshot) => {
    setEmail(snapshot.email);
    setFirstName(snapshot.firstName);
    setLastName(snapshot.lastName);
    setPhone(snapshot.phone);
    setCompany(snapshot.company);
    setDesignation(snapshot.designation);
    setLocation(snapshot.location);
    setHomeAddress(snapshot.homeAddress);
    setWorkAddress(snapshot.workAddress);
    setBillingAddress(snapshot.billingAddress);
    setLinkedinUrl(snapshot.linkedinUrl);
    setXUrl(snapshot.xUrl);
    setAvatarUrl(snapshot.avatarUrl);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarUrl);
      }
    };
  }, [avatarUrl]);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'home') {
        navigate('/dashboard');
      } else if (tab === 'campaigns') {
        navigate('/campaigns');
      } else if (tab === 'inbox') {
        navigate('/inbox');
      } else if (tab === 'automations') {
        navigate('/automations');
      } else if (tab === 'pipeline') {
        navigate('/pipeline');
      } else if (
        tab === 'contacts' ||
        tab === 'segments' ||
        tab === 'templates' ||
        tab === 'connect' ||
        tab === 'settings'
      ) {
        navigate(`/dashboard?tab=${tab}`);
      } else {
        navigate(`/${tab}`);
      }
    },
    [navigate]
  );

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      if (authLoading) return;
      if (!user) {
        navigate('/auth');
        return;
      }

      setLoadingProfile(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const resolvedUser = userData.user ?? user;
        if (!resolvedUser || !mounted) return;

        const metadata = (resolvedUser.user_metadata || {}) as Record<string, any>;
        const snapshot: ProfileSnapshot = {
          email: resolvedUser.email ?? '',
          firstName: metadata.first_name || metadata.given_name || '',
          lastName: metadata.last_name || metadata.family_name || '',
          phone: metadata.phone || '',
          company: metadata.company || '',
          designation: metadata.designation || '',
          location: metadata.location || '',
          homeAddress: metadata.home_address || '',
          workAddress: metadata.work_address || '',
          billingAddress: metadata.billing_address || '',
          linkedinUrl: metadata.linkedin || '',
          xUrl: metadata.x || '',
          avatarUrl: metadata.avatar_url || null,
        };

        applySnapshot(snapshot);
        setProfileBaseline(snapshot);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || String(error),
          variant: 'destructive',
        });
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };

    void loadUser();
    return () => {
      mounted = false;
    };
  }, [applySnapshot, authLoading, navigate, user]);

  useEffect(() => {
    if (!user?.id) {
      setBillingSnapshot(null);
      return;
    }

    let mounted = true;
    const loadSnapshot = async () => {
      setLoadingBillingSnapshot(true);
      try {
        const snapshot = await getBillingSnapshot(user.id);
        if (mounted) setBillingSnapshot(snapshot);
      } catch (error) {
        console.error('Failed to load billing snapshot for profile page:', error);
        if (mounted) setBillingSnapshot(null);
      } finally {
        if (mounted) setLoadingBillingSnapshot(false);
      }
    };

    void loadSnapshot();
    return () => {
      mounted = false;
    };
  }, [user?.id]);
  const displayName = useMemo(() => {
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) return fullName;
    return email.split('@')[0] || 'Workspace Member';
  }, [email, firstName, lastName]);

  const completionPercentage = useMemo(() => {
    const fields = [
      firstName,
      lastName,
      phone,
      company,
      designation,
      location,
      homeAddress,
      workAddress,
      billingAddress,
      linkedinUrl,
      xUrl,
      avatarUrl,
    ];
    const completed = fields.filter((field) => String(field || '').trim().length > 0).length;
    return Math.round((completed / fields.length) * 100);
  }, [
    avatarUrl,
    billingAddress,
    company,
    designation,
    firstName,
    homeAddress,
    lastName,
    linkedinUrl,
    location,
    phone,
    workAddress,
    xUrl,
  ]);

  const completionDescriptor =
    completionPercentage >= 85 ? 'Elite setup' : completionPercentage >= 60 ? 'Healthy setup' : 'Needs attention';

  const normalizedPlan = normalizePlanId(billingSnapshot?.plan_id) || 'free';
  const planPalette = PLAN_PALETTES[normalizedPlan];
  const planName = billingSnapshot?.plan_name || 'Starter Trial';
  const subscriptionStatus = normalizeStatusLabel(billingSnapshot?.subscription_status);

  const statusBadgeClass = useMemo(() => {
    const normalizedStatus = String(billingSnapshot?.subscription_status || 'active').toLowerCase();
    if (normalizedStatus.includes('active') || normalizedStatus.includes('trial')) {
      return 'border-emerald-200 bg-emerald-100 text-emerald-700';
    }
    if (normalizedStatus.includes('past') || normalizedStatus.includes('due')) {
      return 'border-amber-200 bg-amber-100 text-amber-700';
    }
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }, [billingSnapshot?.subscription_status]);

  const creditsUsed = Number(billingSnapshot?.credits_used || 0);
  const creditsInPeriod = Number(billingSnapshot?.credits_in_period || 0);
  const creditsRemaining = Number(billingSnapshot?.credits_remaining || 0);
  const creditsUsagePercentage =
    creditsInPeriod > 0 ? Math.min(100, Math.max(0, (creditsUsed / creditsInPeriod) * 100)) : 0;

  const mailboxesUsed = Number(billingSnapshot?.mailboxes_used || 0);
  const mailboxesLimit = Number(billingSnapshot?.mailbox_limit || 0);
  const mailboxesUsagePercentage = billingSnapshot?.unlimited_mailboxes
    ? 100
    : mailboxesLimit > 0
    ? Math.min(100, Math.max(0, (mailboxesUsed / mailboxesLimit) * 100))
    : 0;

  const inputClassName =
    'mt-2 h-11 rounded-xl border-slate-200/80 bg-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus-visible:border-emerald-300 focus-visible:ring-emerald-300/35';
  const panelClassName =
    'relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_24px_65px_rgba(15,23,42,0.12)] backdrop-blur-xl';

  const handleAvatarSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;
    if (avatarUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(avatarUrl);
    }
    setAvatarFile(nextFile);
    setAvatarUrl(URL.createObjectURL(nextFile));
  };

  const handleReset = () => {
    if (!profileBaseline) return;
    applySnapshot(profileBaseline);
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast({ title: 'Reset complete', description: 'Restored the last saved profile values.' });
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const avatarIsLocalPreview = Boolean(avatarUrl?.startsWith('blob:'));
      let uploadedAvatarUrl: string | null = avatarIsLocalPreview ? profileBaseline?.avatarUrl || null : avatarUrl;

      if (avatarFile) {
        try {
          const extension = avatarFile.name.split('.').pop() || 'jpg';
          const filename = `${user.id}/${Date.now()}.${extension}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filename, avatarFile, { upsert: true });

          if (uploadError) {
            console.warn('Avatar upload error:', uploadError.message || uploadError);
            toast({
              title: 'Avatar upload skipped',
              description: 'Profile saved without replacing the existing avatar.',
            });
          } else {
            const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
            uploadedAvatarUrl = publicData.publicUrl;
          }
        } catch (uploadError) {
          console.warn('Avatar upload failed:', uploadError);
        }
      }

      const metadata: Record<string, any> = {
        first_name: firstName,
        last_name: lastName,
        phone,
        company,
        designation,
        location,
        home_address: homeAddress,
        work_address: workAddress,
        billing_address: billingAddress,
        linkedin: linkedinUrl,
        x: xUrl,
        avatar_url: uploadedAvatarUrl ?? null,
      };

      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;

      try {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email,
            ...metadata,
          })
          .select();
      } catch (upsertError) {
        console.warn('profiles upsert failed:', upsertError);
      }

      const updatedSnapshot: ProfileSnapshot = {
        email,
        firstName,
        lastName,
        phone,
        company,
        designation,
        location,
        homeAddress,
        workAddress,
        billingAddress,
        linkedinUrl,
        xUrl,
        avatarUrl: uploadedAvatarUrl,
      };

      applySnapshot(updatedSnapshot);
      setProfileBaseline(updatedSnapshot);
      setAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      toast({ title: 'Saved', description: 'Profile updated successfully.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: 'Logged out', description: 'You have been logged out.' });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout
      activeTab="settings"
      onTabChange={handleTabChange}
      user={user}
      onLogout={handleLogout}
      contentClassName="max-w-[92rem]"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        @keyframes profile-rise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes profile-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }
      `}</style>

      <div className="space-y-6" style={{ fontFamily: '"Plus Jakarta Sans", var(--shell-font-body)' }}>
        <section className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/70 p-7 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="pointer-events-none absolute -top-24 right-6 h-64 w-64 rounded-full bg-emerald-300/45 blur-3xl animate-[profile-float_9s_ease-in-out_infinite]" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-amber-300/35 blur-3xl animate-[profile-float_12s_ease-in-out_infinite]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.62)_0%,rgba(255,255,255,0.22)_45%,rgba(16,185,129,0.08)_100%)]" />

          <div className="relative z-10 grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
            <div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-24 w-24 overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.2)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
                      <User className="h-10 w-10" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    Profile Studio
                  </span>

                  <div>
                    <h1
                      className="text-3xl font-semibold text-slate-900 md:text-4xl"
                      style={{ fontFamily: '"Space Grotesk", var(--shell-font-display)' }}
                    >
                      {displayName}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">{email || 'No email available'}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {user?.email_confirmed_at ? 'Verified email' : 'Verification pending'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${planPalette.badgeClass}`}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      {planName}
                    </span>
                    {loadingProfile && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Refreshing profile
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelection}
              />

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={saving}
                >
                  Upload New Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={saving}
                >
                  Remove Photo
                </Button>
              </div>

              <div className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <span>Profile Completion</span>
                  <span>{completionPercentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 transition-all duration-700"
                    style={{ width: `${Math.max(0, Math.min(100, completionPercentage))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {completionDescriptor}. Complete all sections to strengthen account trust and personalization.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Credits Remaining</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {loadingBillingSnapshot ? '...' : creditsRemaining.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {loadingBillingSnapshot
                    ? 'Loading current cycle usage'
                    : `${creditsUsed.toLocaleString()} used this cycle`}
                </p>
              </div>

              <div className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Mailbox Capacity</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {mailboxesUsed}
                  {billingSnapshot?.unlimited_mailboxes ? ' / Unlimited' : ` / ${mailboxesLimit || 0}`}
                </p>
                <p className="mt-1 text-xs text-slate-600">Active sending infrastructure</p>
              </div>

              <div className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)] sm:col-span-2 xl:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last Login</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatReadableDate((user as any)?.last_sign_in_at || null)}
                </p>
                <p className="mt-1 text-xs text-slate-600">Keep your profile fresh for better deliverability insights</p>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleUpdate} className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-8 space-y-6">
            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '80ms', animationFillMode: 'both' }}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2
                    className="text-xl font-semibold text-slate-900"
                    style={{ fontFamily: '"Space Grotesk", var(--shell-font-display)' }}
                  >
                    Personal Details
                  </h2>
                  <p className="text-sm text-slate-600">Core identity details used across your workspace.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">First Name</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Last Name</Label>
                  <div className="relative">
                    <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Business Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={email} readOnly className={`${inputClassName} pl-9 text-slate-500`} />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Phone Number</Label>
                  <div className="relative">
                    <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '140ms', animationFillMode: 'both' }}
            >
              <div className="mb-5">
                <h2
                  className="text-xl font-semibold text-slate-900"
                  style={{ fontFamily: '"Space Grotesk", var(--shell-font-display)' }}
                >
                  Professional Profile
                </h2>
                <p className="text-sm text-slate-600">Organization context and role alignment.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Company Name</Label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Designation</Label>
                  <div className="relative">
                    <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={designation}
                      onChange={(event) => setDesignation(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Location</Label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              <div className="mb-5">
                <h2
                  className="text-xl font-semibold text-slate-900"
                  style={{ fontFamily: '"Space Grotesk", var(--shell-font-display)' }}
                >
                  Address and Social Links
                </h2>
                <p className="text-sm text-slate-600">Where invoices, team details, and external identity are mapped.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Home Address</Label>
                  <div className="relative">
                    <Home className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={homeAddress}
                      onChange={(event) => setHomeAddress(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Work Address</Label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={workAddress}
                      onChange={(event) => setWorkAddress(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Billing Address</Label>
                  <div className="relative">
                    <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={billingAddress}
                      onChange={(event) => setBillingAddress(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">LinkedIn URL</Label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={linkedinUrl}
                      onChange={(event) => setLinkedinUrl(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-slate-500">X / Twitter URL</Label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={xUrl}
                      onChange={(event) => setXUrl(event.target.value)}
                      className={`${inputClassName} pl-9`}
                      disabled={loadingProfile || saving}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-5">
                <Button
                  type="submit"
                  disabled={saving || loadingProfile}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={saving || !profileBaseline}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset to Last Save
                </Button>
              </div>
            </section>
          </div>

          <aside className="col-span-12 xl:col-span-4 space-y-6">
            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '100ms', animationFillMode: 'both' }}
            >
              <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl ${planPalette.glowClass}`} />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Plan</p>
                    <h3 className="mt-1 text-2xl font-semibold text-slate-900">{planName}</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass}`}>
                    {subscriptionStatus}
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/75 px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <Clock className="h-4 w-4" />
                      Active Until
                    </span>
                    <span className="font-semibold text-slate-900">{formatReadableDate(billingSnapshot?.current_period_end)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/75 px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <CreditCard className="h-4 w-4" />
                      Billing Cycle
                    </span>
                    <span className="font-semibold capitalize text-slate-900">{billingSnapshot?.billing_cycle || 'monthly'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/75 px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <BarChart3 className="h-4 w-4" />
                      Credits Used
                    </span>
                    <span className="font-semibold text-slate-900">
                      {creditsUsed.toLocaleString()} / {creditsInPeriod.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                    <span>Cycle utilization</span>
                    <span>{Math.round(creditsUsagePercentage)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${planPalette.meterClass}`}
                      style={{ width: `${Math.max(6, creditsUsagePercentage)}%` }}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  className="mt-5 w-full bg-[var(--shell-accent)] text-white hover:bg-emerald-700"
                  onClick={() => navigate('/subscription')}
                >
                  Manage Subscription
                </Button>
              </div>
            </section>

            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '160ms', animationFillMode: 'both' }}
            >
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Usage Overview</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">Performance Signals</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Profile Readiness</span>
                    <span className="font-semibold text-slate-900">{completionPercentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Credit Consumption</span>
                    <span className="font-semibold text-slate-900">{Math.round(creditsUsagePercentage)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
                      style={{ width: `${Math.max(4, creditsUsagePercentage)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Mailbox Utilization</span>
                    <span className="font-semibold text-slate-900">
                      {billingSnapshot?.unlimited_mailboxes ? 'Unlimited' : `${Math.round(mailboxesUsagePercentage)}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500"
                      style={{ width: `${Math.max(4, mailboxesUsagePercentage)}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`${panelClassName} animate-[profile-rise_700ms_cubic-bezier(0.22,1,0.36,1)]`}
              style={{ animationDelay: '220ms', animationFillMode: 'both' }}
            >
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">Account Operations</h3>
              </div>

              <div className="space-y-3">
                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => navigate('/billing')}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Open Billing Center
                </Button>
                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => navigate('/spending')}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Review Spending History
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleTabChange('settings')}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open Workspace Settings
                </Button>
              </div>
            </section>
          </aside>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
