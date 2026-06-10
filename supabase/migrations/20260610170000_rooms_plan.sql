-- OUROO PRAÇA — each room picks a floor PLAN (shape + base levels: salao/quadrado/ele/cruz/octo/
-- palco/patio). The plan id is rendered client-side from @/lib/roomPlans. Safe to re-run.

alter table public.rooms add column if not exists plan text not null default 'salao';
