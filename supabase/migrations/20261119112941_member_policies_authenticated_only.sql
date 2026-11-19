-- Oturumsuz (anon) istekler workspaces gibi tablolarda PUBLIC politikaları değerlendirip
-- is_workspace_member'a takılıyor, "permission denied for function is_workspace_member"
-- hata kaydı açıyordu (2026-11-11 … 2026-11-18). Bu politikaların hepsi auth.uid() ya da
-- üyelik kontrolüne dayanır; anon için hiçbir satır döndürmezler. Politikaları yalnızca
-- authenticated rolüne bağlamak anon isteğe hata yerine boş sonuç verir. İfadeler değişmez;
-- service_role RLS'i zaten atlar.
alter policy ai_insights_select_member on public.ai_insights to authenticated;
alter policy ai_insights_update_editor on public.ai_insights to authenticated;
alter policy card_installment_purchases_delete_editor on public.card_installment_purchases to authenticated;
alter policy card_installment_purchases_insert_editor on public.card_installment_purchases to authenticated;
alter policy card_installment_purchases_select_member on public.card_installment_purchases to authenticated;
alter policy card_installment_purchases_update_editor on public.card_installment_purchases to authenticated;
alter policy profiles_select_own on public.profiles to authenticated;
alter policy profiles_update_own on public.profiles to authenticated;
alter policy push_tokens_delete_own on public.push_tokens to authenticated;
alter policy push_tokens_insert_own on public.push_tokens to authenticated;
alter policy push_tokens_select_own on public.push_tokens to authenticated;
alter policy push_tokens_update_own on public.push_tokens to authenticated;
alter policy shopier_orders_insert_own on public.shopier_orders to authenticated;
alter policy shopier_orders_select_own on public.shopier_orders to authenticated;
alter policy workspace_members_delete_owner_or_self on public.workspace_members to authenticated;
alter policy workspace_members_select_same_workspace on public.workspace_members to authenticated;
alter policy workspaces_delete_owner on public.workspaces to authenticated;
alter policy workspaces_insert_own on public.workspaces to authenticated;
alter policy workspaces_select_member on public.workspaces to authenticated;
alter policy workspaces_update_owner on public.workspaces to authenticated;
