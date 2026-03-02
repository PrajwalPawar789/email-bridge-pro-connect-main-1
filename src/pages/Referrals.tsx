import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_REFERRAL_BONUS_CREDITS,
  ReferralEventRow,
  ReferralProgramDashboard,
  buildReferralLink,
  getReferralProgramDashboard,
  listReferralEvents,
  registerReferralProgramMember,
} from '@/lib/referrals';
import {
  CheckCircle2,
  Coins,
  Copy,
  Gift,
  Link2,
  RefreshCw,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

const getStatusBadgeClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'rewarded') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'pending' || normalized === 'qualified') {
    return 'border border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized === 'rejected') return 'border border-rose-200 bg-rose-50 text-rose-700';
  return 'border border-slate-200 bg-slate-50 text-slate-700';
};

const Referrals = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab] = useState('referrals');

  const [loadingData, setLoadingData] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [dashboard, setDashboard] = useState<ReferralProgramDashboard | null>(null);
  const [events, setEvents] = useState<ReferralEventRow[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.user_metadata) return;
    const metadata = user.user_metadata as Record<string, unknown>;

    setFirstName(String(metadata.first_name || metadata.given_name || ''));
    setLastName(String(metadata.last_name || metadata.family_name || ''));
    setCompanyName(String(metadata.company || ''));
    setCompanyEmail(String(user.email || ''));
  }, [user?.email, user?.user_metadata]);

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/dashboard');
    else if (tab === 'campaigns') navigate('/campaigns');
    else if (tab === 'inbox') navigate('/inbox');
    else if (tab === 'automations') navigate('/automations');
    else if (tab === 'pipeline') navigate('/pipeline');
    else if (
      tab === 'contacts' ||
      tab === 'segments' ||
      tab === 'templates' ||
      tab === 'connect' ||
      tab === 'settings'
    ) {
      navigate(`/dashboard?tab=${tab}`);
    } else if (tab === 'subscription') navigate('/subscription');
    else if (tab === 'billing') navigate('/billing');
    else if (tab === 'spending') navigate('/spending');
    else navigate('/referrals');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    setLoadingData(true);
    try {
      const [dashboardRow, eventRows] = await Promise.all([
        getReferralProgramDashboard(user.id),
        listReferralEvents(user.id, 100),
      ]);

      setDashboard(dashboardRow);
      setEvents(eventRows);

      if (dashboardRow.isRegistered) {
        setFirstName(dashboardRow.firstName || '');
        setLastName(dashboardRow.lastName || '');
        setCompanyName(dashboardRow.companyName || '');
        setCompanyEmail(dashboardRow.companyEmail || user.email || '');
        setTermsAccepted(true);
      }
    } catch (error: any) {
      console.error('Failed to load referral dashboard:', error);
      toast({
        title: 'Failed to load referrals',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingData(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    if (user) {
      void loadData();
    }
  }, [loading, user, navigate, loadData]);

  const referralLink = useMemo(() => {
    if (!dashboard?.referralCode) return '';
    return buildReferralLink(dashboard.referralCode);
  }, [dashboard?.referralCode]);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) return;

    if (!termsAccepted) {
      toast({
        title: 'Accept terms first',
        description: 'You need to accept the referral terms to continue.',
        variant: 'destructive',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const updatedDashboard = await registerReferralProgramMember(user.id, {
        firstName,
        lastName,
        companyName,
        companyEmail,
        termsAccepted,
      });

      setDashboard(updatedDashboard);
      toast({
        title: 'Referral profile ready',
        description: 'Your referral link is now active and ready to share.',
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: 'Could not save referral profile',
        description: error?.message || 'Please verify the form and try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: 'Referral link copied' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy link',
        description: 'Please copy it manually from the field.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--shell-ink)]">Referral Program</h1>
            <p className="text-sm text-[var(--shell-muted)]">
              Share your referral link and earn {DEFAULT_REFERRAL_BONUS_CREDITS.toLocaleString()} bonus credits for each successful signup.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadData()} disabled={loadingData}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {!dashboard?.isRegistered ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  Join the referral program
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ref-first-name">First name *</Label>
                      <Input
                        id="ref-first-name"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="Jordan"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ref-last-name">Last name *</Label>
                      <Input
                        id="ref-last-name"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        placeholder="Lee"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-company">Company *</Label>
                    <Input
                      id="ref-company"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Northwind"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-company-email">Company email *</Label>
                    <Input
                      id="ref-company-email"
                      type="email"
                      value={companyEmail}
                      onChange={(event) => setCompanyEmail(event.target.value)}
                      placeholder="jordan@northwind.com"
                      required
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(Boolean(checked))} />
                    <span>
                      I agree to the referral program terms and confirm my referral details are accurate.
                    </span>
                  </label>

                  <Button type="submit" className="w-full" disabled={savingProfile}>
                    {savingProfile ? 'Creating referral profile...' : 'Get my referral link'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  How it works
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm text-slate-700">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Step 1: Register once</p>
                    <p>Complete your referral profile to unlock your unique referral link.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Step 2: Share your link</p>
                    <p>Every signup using your link is tracked automatically in your referral activity.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Step 3: Earn rewards</p>
                    <p>
                      You receive <strong>{DEFAULT_REFERRAL_BONUS_CREDITS.toLocaleString()} bonus credits</strong> for each successful referral signup.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5 text-emerald-600" />
                  Your referral link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={referralLink} readOnly className="font-mono text-xs" />
                  <Button type="button" onClick={handleCopyLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
                <div className="text-xs text-slate-500">
                  Share this link publicly or privately. Referrals are automatically tracked when new users register.
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Total Referrals</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">{dashboard.totalReferrals.toLocaleString()}</span>
                  <Users className="h-5 w-5 text-slate-400" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Pending</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">{dashboard.pendingReferrals.toLocaleString()}</span>
                  <Gift className="h-5 w-5 text-amber-500" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Rewarded</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">{dashboard.rewardedReferrals.toLocaleString()}</span>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Bonus Credits Earned</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">{dashboard.totalBonusCredits.toLocaleString()}</span>
                  <Coins className="h-5 w-5 text-emerald-600" />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Referral activity</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    No referrals yet. Share your link to start earning rewards.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="py-2 pr-4">Referred user</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Bonus credits</th>
                          <th className="py-2 pr-4">Created</th>
                          <th className="py-2 pr-4">Rewarded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((eventRow) => (
                          <tr key={eventRow.id} className="border-b">
                            <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                              {eventRow.referred_user_id.slice(0, 8)}...
                            </td>
                            <td className="py-2 pr-4">
                              <Badge className={getStatusBadgeClass(eventRow.status)}>{eventRow.status}</Badge>
                            </td>
                            <td className="py-2 pr-4">{Number(eventRow.bonus_credits || 0).toLocaleString()}</td>
                            <td className="py-2 pr-4 text-slate-600">{formatDate(eventRow.created_at)}</td>
                            <td className="py-2 pr-4 text-slate-600">{formatDate(eventRow.bonus_awarded_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Referrals;
