-- たね：保存とAI利用回数の表
-- 端末ごとに匿名ログインし、自分の行だけ読み書きできる（RLS）。

-- アプリの状態（ストック・アーカイブ・重み・プロジェクト）を key ごとに丸ごと保存する
create table if not exists public.user_state (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null check (key in ('tane-swipe','tane-projects')),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_state enable row level security;

create policy "own state: select" on public.user_state
  for select to authenticated using (auth.uid() = user_id);
create policy "own state: insert" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own state: update" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own state: delete" on public.user_state
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.user_state to authenticated;

-- AIを呼んだ回数（1人1日の上限を守るため）。アプリからは直接触らせない
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'Asia/Tokyo')::date,
  calls   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "own usage: select" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);
grant select on public.ai_usage to authenticated;

-- 1回分を数え、上限内なら true を返す。サーバー関数（service role）からだけ呼ぶ
create or replace function public.ai_take(p_user uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, calls)
  values (p_user, (now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into n;
  return n <= p_limit;
end $$;
revoke all on function public.ai_take(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, int) to service_role;
