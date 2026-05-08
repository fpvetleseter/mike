create or replace function public.increment_queries_today(
  user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set queries_today = queries_today + 1
  where id = user_id;
end;
$$;
