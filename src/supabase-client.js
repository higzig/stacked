import { createClient } from '@supabase/supabase-js';
window.createPopBiaClient = (anonymous = false) => {
  const config = window.POPBIA_SUPABASE;
  if (!config?.url || !config?.publishableKey) throw new Error('Collection is not configured yet. Set the public Supabase URL and publishable key.');
  return createClient(config.url, config.publishableKey, { auth: {
    persistSession: !anonymous, autoRefreshToken: !anonymous, detectSessionInUrl: !anonymous,
    storageKey: anonymous ? 'popbia-display' : 'popbia-account'
  }});
};
