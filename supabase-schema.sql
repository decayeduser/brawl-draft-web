-- ============================================================================
-- BrawlVault Match Guides • Supabase Schema & Row-Level Security (RLS)
-- Paste this entire script into Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- 1. User Profiles (public display info only — emails stay private in auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Brawler',
  avatar_url text default '',
  brawl_tag text default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and is_admin = false);

create policy "Users can update their own non-admin fields"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
  );

-- 2. Match & Brawler Guides
create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_avatar text default '',
  title text not null check (char_length(trim(title)) between 4 and 110),
  mode text not null default 'all',
  map text not null default 'Any Map',
  brawler text not null,
  brawler_id int not null default 0,
  star_power text default '' check (char_length(star_power) <= 80),
  gadget text default '' check (char_length(gadget) <= 80),
  gears text default '' check (char_length(gears) <= 80),
  synergies text default '' check (char_length(synergies) <= 140),
  counters text default '' check (char_length(counters) <= 140),
  body text not null check (char_length(trim(body)) between 20 and 4000),
  upvotes_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_guides_created_at on public.guides (created_at desc);
create index if not exists idx_guides_upvotes on public.guides (upvotes_count desc, created_at desc);
create index if not exists idx_guides_mode_brawler on public.guides (mode, brawler);

alter table public.guides enable row level security;

create policy "Guides are readable by everyone"
  on public.guides for select
  using (true);

-- Anti-spam rate limit enforced at the database level: max 5 guides per 24h per user
create policy "Authenticated users can publish guides (max 5 per 24h)"
  on public.guides for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and upvotes_count = 0
    and (
      select count(*) from public.guides g
      where g.author_id = auth.uid()
        and g.created_at > now() - interval '24 hours'
    ) < 5
  );

create policy "Authors or admins can update guides"
  on public.guides for update
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "Authors or admins can delete guides"
  on public.guides for delete
  to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- 3. Upvotes (strictly 1 vote per user per guide)
create table if not exists public.guide_votes (
  guide_id uuid not null references public.guides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guide_id, user_id)
);

alter table public.guide_votes enable row level security;

create policy "Votes are readable by everyone"
  on public.guide_votes for select
  using (true);

create policy "Authenticated users can upvote"
  on public.guide_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own upvote"
  on public.guide_votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4. Trigger to maintain guides.upvotes_count automatically (tamper-proof)
create or replace function public.sync_guide_upvotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.guides set upvotes_count = upvotes_count + 1 where id = new.guide_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.guides set upvotes_count = greatest(0, upvotes_count - 1) where id = old.guide_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_guide_votes_count on public.guide_votes;
create trigger trg_guide_votes_count
  after insert or delete on public.guide_votes
  for each row execute function public.sync_guide_upvotes();

-- ============================================================================
-- OPTIONAL: Make yourself an Admin (can moderate/delete any spam guide)
-- After signing in once with your Google account, run:
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL@gmail.com');
-- ============================================================================
