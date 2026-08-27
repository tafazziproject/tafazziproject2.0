"use strict";

(function () {
  function requireClient() {
    const api = window.TafazziSupabase;
    if (!api?.configured || !api.client) {
      throw new Error("Supabase non configurato. Compila config.js con URL e Publishable key del progetto.");
    }
    return api;
  }

  function mapAudio(row) {
    const { client, bucket } = requireClient();
    const { data } = client.storage.from(bucket).getPublicUrl(row.storage_path);

    return {
      id: row.id,
      name: row.name,
      safe: Boolean(row.safe),
      key: row.shortcut || null,
      path: data.publicUrl,
      storagePath: row.storage_path,
      fileName: row.original_filename || row.storage_path.split("/").pop(),
      size: Number(row.size_bytes) || 0,
      source: "supabase",
      createdAt: row.created_at,
    };
  }

  async function getLibrary() {
    const { client } = requireClient();
    const { data, error } = await client
      .from("audios")
      .select("id,name,safe,shortcut,storage_path,original_filename,size_bytes,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapAudio);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  window.TafazziStore = { getLibrary, formatBytes };
})();
