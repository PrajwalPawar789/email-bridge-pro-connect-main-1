import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/AuthProvider';

const Profile = () => {
  const [loading, setLoading] = useState(false);
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
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('settings');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/dashboard');
    } else if (tab === 'campaigns') {
      navigate('/campaigns');
    } else if (tab === 'inbox') {
      navigate('/inbox');
    } else if (tab === 'automations') {
      navigate('/automations');
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
  };

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (authLoading) return;
      if (!user) {
        navigate('/auth');
        return;
      }

      setLoading(true);
      try {
        // Also fetch the up-to-date user object
        const { data: userData } = await supabase.auth.getUser();
        const u = userData.user ?? user;
        if (!u) return;
        if (mounted) {
          setEmail(u.email ?? '');
          setFirstName((u.user_metadata as any)?.first_name || (u.user_metadata as any)?.given_name || '');
          setLastName((u.user_metadata as any)?.last_name || (u.user_metadata as any)?.family_name || '');
          setPhone((u.user_metadata as any)?.phone || '');
          setCompany((u.user_metadata as any)?.company || '');
          setDesignation((u.user_metadata as any)?.designation || '');
          setLocation((u.user_metadata as any)?.location || '');
          setHomeAddress((u.user_metadata as any)?.home_address || '');
          setWorkAddress((u.user_metadata as any)?.work_address || '');
          setBillingAddress((u.user_metadata as any)?.billing_address || '');
          setLinkedinUrl((u.user_metadata as any)?.linkedin || '');
          setXUrl((u.user_metadata as any)?.x || '');
          setAvatarUrl((u.user_metadata as any)?.avatar_url || null);
        }
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadUser();
    return () => { mounted = false };
  }, [navigate, user, authLoading]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // If user uploaded a new avatar file, try to upload to storage
      let uploadedAvatarUrl: string | null = avatarUrl;
      if (avatarFile && user) {
        try {
          const ext = avatarFile.name.split('.').pop();
          const filename = `${user.id}.${ext}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filename, avatarFile, { upsert: true });

          if (uploadError) {
            console.warn('avatar upload error', uploadError.message || uploadError);
            toast({ title: 'Warning', description: 'Unable to upload avatar to storage. Preview only.', variant: 'default' });
          } else {
            const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
            uploadedAvatarUrl = publicData.publicUrl;
            setAvatarUrl(uploadedAvatarUrl);
          }
        } catch (err: any) {
          console.warn('avatar upload failed', err);
        }
      }

      // Update auth user metadata
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
      };
      if (uploadedAvatarUrl) metadata.avatar_url = uploadedAvatarUrl;

      const { data: updateData, error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;

      // Try upserting into `profiles` table if available
      try {
        await supabase.from('profiles').upsert({ id: user.id, email, ...metadata, avatar_url: uploadedAvatarUrl }).select();
      } catch (e) {
        // it's ok if table doesn't exist
      }

      toast({ title: 'Saved', description: 'Profile updated successfully.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
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

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="grid grid-cols-12 gap-6">
        {/* Left - personal information */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col items-start gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-slate-400">No Photo</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Button onClick={() => fileInputRef.current?.click()}>Upload Photo</Button>
                        <Button variant="outline" onClick={() => { setAvatarFile(null); setAvatarUrl(null); }}>Remove</Button>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) {
                          setAvatarFile(f);
                          setAvatarUrl(URL.createObjectURL(f));
                        }
                      }} />
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-2">
                    <Label>First Name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-2" />
                  </div>

                  <div className="col-span-2 md:col-span-2">
                    <Label>Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-2" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Business Email</Label>
                    <Input value={email} readOnly className="mt-2" />
                  </div>

                  <div>
                    <Label>Phone Number</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div>
                  <Label>Company Name</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>Designation</Label>
                  <Input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-2" />
                </div>

                <div>
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>Home Address</Label>
                  <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} className="mt-2" />
                </div>

                <div>
                  <Label>Work Address</Label>
                  <Input value={workAddress} onChange={(e) => setWorkAddress(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>Billing Address</Label>
                  <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className="mt-2" />
                </div>

                <div>
                  <Label>LinkedIn URL</Label>
                  <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label>X / Twitter URL</Label>
                  <Input value={xUrl} onChange={(e) => setXUrl(e.target.value)} className="mt-2" />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <Button onClick={handleUpdate} disabled={loading} className="bg-amber-500 hover:bg-amber-600">{loading ? 'Saving...' : 'Save Changes'}</Button>
                <Button variant="outline" onClick={() => {
                  setFirstName(''); setLastName(''); setPhone(''); setCompany(''); setDesignation(''); setLocation(''); setHomeAddress(''); setWorkAddress(''); setBillingAddress(''); setLinkedinUrl(''); setXUrl('');
                }}>Reset</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right - plan & usage */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold">Current Plan <span className="text-emerald-600 ml-2">Active</span></div>
                <div className="text-lg font-bold">{(user?.user_metadata as any)?.plan_name || 'Free Plan'}</div>
                <div className="text-sm text-slate-500">Credits Spent <strong>253</strong></div>
                <div className="text-sm text-slate-500">Subscription Activated <div className="inline-block ml-1 font-medium">Dec 23, 2025</div></div>
                <div className="text-sm text-slate-500">Plan Expiry Date <div className="inline-block ml-1 font-medium">Dec 23, 2026</div></div>
                <div className="text-sm text-slate-500">Last Login <div className="inline-block ml-1 font-medium">Today</div></div>
                <div className="mt-4">
                  <Button variant="destructive" className="w-full">Cancel Subscription</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded p-3 text-center">
                  <div className="text-sm text-slate-500">Available Credits</div>
                  <div className="text-xl font-bold">37,797</div>
                </div>
                <div className="bg-slate-50 rounded p-3 text-center">
                  <div className="text-sm text-slate-500">Credits Spent</div>
                  <div className="text-xl font-bold">253</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm text-slate-500">Credit Usage</div>
                <div className="w-full bg-slate-100 rounded h-3 mt-2 overflow-hidden">
                  <div className="h-3 bg-amber-400" style={{ width: '5%' }} />
                </div>
                <div className="text-xs text-slate-500 mt-2">253 / 38,050</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
