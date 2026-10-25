-- Ekip üyesi limitleri: Plus artık 2 ekip üyesi davet edebilir (önceden null = ekip yok),
-- İşletme 10'dan 50'ye çıkar. Sayım çalışma alanı SAHİBİNİ içermez.
--
-- create_workspace_invite / redeem_workspace_invite değişmez: ikisi de limiti
-- team_member_limit_for_workspace üzerinden plan_limits'ten okur (null → TEAM_PLAN_REQUIRED,
-- sayı → TEAM_LIMIT_REACHED). Fonksiyonların ham hata metni hâlâ "İşletme planında" der ama
-- kullanıcıya gösterilmez; istemci hata koduna göre kendi metnini gösterir (utils/alerts.ts).
--
-- Plan düşürmede mevcut üyeler silinmez; yalnızca limit üstündeki yeni katılımlar engellenir.

update public.plan_limits set max_team_members = 2 where plan = 'plus';
update public.plan_limits set max_team_members = 50 where plan = 'isletme';
