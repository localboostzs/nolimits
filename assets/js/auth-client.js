/* Shared passwordless login for NoLimits. All access decisions are made by Supabase RLS
   or the server-side Worker, never by this client-side helper. */
(function () {
  'use strict';
  var cfg = window.NOLIMITS_ACCOUNT_CONFIG || {};
  var enabled = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(cfg.url || '') &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.publishableKey || '') &&
    window.supabase && typeof window.supabase.createClient === 'function';
  var client = enabled ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  }) : null;
  async function user() {
    if (!client) return null;
    var result = await client.auth.getUser();
    return result.error ? null : result.data.user;
  }
  async function profile() {
    var u = await user();
    if (!u) return null;
    var result = await client.from('nl_customer_profiles')
      .select('full_name,phone,address,last_service_key')
      .eq('user_id', u.id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  async function saveProfile(fields) {
    var u = await user();
    if (!u) throw new Error('Bitte zuerst anmelden.');
    var record = { user_id: u.id };
    ['full_name','phone','address','last_service_key'].forEach(function(k) {
      if (typeof fields[k] === 'string') record[k] = fields[k].trim();
    });
    var result = await client.from('nl_customer_profiles')
      .upsert(record, { onConflict: 'user_id' });
    if (result.error) throw result.error;
  }
  async function staff() {
    var u = await user();
    if (!u) return null;
    var result = await client.from('nl_staff')
      .select('role,active').eq('user_id',u.id).maybeSingle();
    if (result.error) throw result.error;
    return result.data && result.data.active ? result.data : null;
  }
  async function bearer() {
    if (!client) return null;
    var r = await client.auth.getSession();
    if (r.error) throw r.error;
    return r.data.session && r.data.session.access_token;
  }
  window.NOLIMITS_ACCOUNT = {
    enabled: !!enabled, client: client, user: user, profile: profile,
    saveProfile: saveProfile, staff: staff, bearer: bearer,
    async emailSignIn(email, redirectUrl) {
      if (!client) throw new Error('Kundenlogin noch nicht eingerichtet.');
      var r = await client.auth.signInWithOtp({
        email: email,
        options: { shouldCreateUser: true, emailRedirectTo: redirectUrl }
      });
      if (r.error) throw r.error;
    },
    async signOut() { if (client) await client.auth.signOut(); }
  };
})();
