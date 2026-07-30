// docs/07-guvenlik-gizlilik.md — "Hesabı uygulama içinden silme" P0 gereksinimi.
// workspaces.owner_id -> auth.users ve tüm workspace-scoped tablolar workspaces.id üzerinden
// ON DELETE CASCADE olduğundan, kullanıcıyı auth.users'tan silmek sahip olduğu tüm veriyi
// (hesaplar, işlemler, borç/alacak, belgeler vb.) otomatik olarak temizler. Bu fonksiyon
// yalnızca önce Storage'daki orijinal belgeleri siler, ardından kullanıcıyı siler.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Yetkilendirme başlığı eksik' }), { status: 401 });
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await authedClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Oturum bulunamadı' }), { status: 401 });
  }
  const userId = userData.user.id;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: ownedWorkspaces, error: workspacesError } = await adminClient
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId);
    if (workspacesError) throw workspacesError;

    const workspaceIds = (ownedWorkspaces ?? []).map((w) => w.id);

    if (workspaceIds.length > 0) {
      const { data: documents, error: documentsError } = await adminClient
        .from('financial_documents')
        .select('storage_path')
        .in('workspace_id', workspaceIds);
      if (documentsError) throw documentsError;

      const storagePaths = (documents ?? [])
        .map((d) => d.storage_path)
        .filter((p): p is string => !!p);

      if (storagePaths.length > 0) {
        const { error: removeError } = await adminClient.storage
          .from('financial-documents')
          .remove(storagePaths);
        if (removeError) throw removeError;
      }
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
