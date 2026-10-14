-- 0024: delivery-app commission is never an expense row.
--
-- Strow takes Talabat / Keeta / Beanz fees off every closing at the owner's rates
-- (Pulse, Sales, P&L). On 13 Oct 2026 Strow AI booked six "commission_estimate"
-- expenses (May–Oct, AED 16,581) on top of that, so the fees counted twice and
-- Pulse projected -9k for October. Those rows are now rejected; this trigger
-- stops any new one from being confirmed or kept pending.

create or replace function public.expenses_block_app_commission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.doc_type = 'commission_estimate' and new.status is distinct from 'rejected' then
    raise exception using
      message = 'Delivery-app commission is not an expense: Strow already deducts it from each closing. Reject or delete this row instead.',
      errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_expenses_block_app_commission') then
    create trigger trg_expenses_block_app_commission
      before insert or update on public.expenses
      for each row execute function public.expenses_block_app_commission();
  end if;
end $$;

comment on function public.expenses_block_app_commission() is
  'Blocks expenses with doc_type commission_estimate unless rejected — app fees come from closings, never from bills.';
