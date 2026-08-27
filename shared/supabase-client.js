"use strict";

(function () {
  const config = window.TAFAZZI_CONFIG || {};
  const url = String(config.SUPABASE_URL || "").trim();
  const key = String(config.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const bucket = String(config.AUDIO_BUCKET || "audio").trim() || "audio";

  const configured = Boolean(
    url && key &&
    !url.includes("YOUR_PROJECT_REF") &&
    !key.includes("YOUR_SUPABASE_PUBLISHABLE_KEY") &&
    window.supabase?.createClient
  );

  const client = configured
    ? window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

  async function isAdmin() {
    if (!client) return false;
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return false;

    const { data, error } = await client.rpc("is_admin");
    if (error) throw error;
    return data === true;
  }

  window.TafazziSupabase = {
    client,
    bucket,
    configured,
    isAdmin,
    config,
  };
})();
