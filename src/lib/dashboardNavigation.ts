import type { NavigateFunction } from 'react-router-dom';

export const handleDashboardTabNavigation = (navigate: NavigateFunction, tab: string) => {
  if (tab === 'home') {
    navigate('/dashboard');
    return;
  }

  if (tab === 'campaigns') {
    navigate('/campaigns');
    return;
  }

  if (tab === 'inbox') {
    navigate('/inbox');
    return;
  }

  if (tab === 'automations') {
    navigate('/automations');
    return;
  }

  if (tab === 'pipeline') {
    navigate('/pipeline');
    return;
  }

  if (tab === 'find') {
    navigate('/find');
    return;
  }

  if (tab === 'referrals') {
    navigate('/referrals');
    return;
  }

  if (tab === 'team') {
    navigate('/team');
    return;
  }

  if (tab === 'email-builder' || tab === 'templates') {
    navigate('/email-builder');
    return;
  }

  if (tab === 'landing-pages') {
    navigate('/landing-pages');
    return;
  }

  if (tab === 'site-connector' || tab === 'connect') {
    navigate('/site-connector');
    return;
  }

  if (tab === 'contacts' || tab === 'segments' || tab === 'settings' || tab === 'integrations') {
    navigate(`/dashboard?tab=${tab}`);
    return;
  }

  navigate(`/${tab}`);
};
