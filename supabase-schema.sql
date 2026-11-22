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

drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and is_admin = false);

drop policy if exists "Users can update their own non-admin fields" on public.profiles;
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

drop policy if exists "Guides are readable by everyone" on public.guides;
create policy "Guides are readable by everyone"
  on public.guides for select
  to anon, authenticated
  using (true);

-- Anti-spam rate limit enforced at the database level: max 5 guides per 24h per user
drop policy if exists "Authenticated users can publish guides (max 5 per 24h)" on public.guides;
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

drop policy if exists "Authors or admins can update guides" on public.guides;
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

drop policy if exists "Authors or admins can delete guides" on public.guides;
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

drop policy if exists "Votes are readable by everyone" on public.guide_votes;
create policy "Votes are readable by everyone"
  on public.guide_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can upvote" on public.guide_votes;
create policy "Authenticated users can upvote"
  on public.guide_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own upvote" on public.guide_votes;
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

-- 5. Server-side Content Moderation Trigger (cannot be bypassed even via direct API)
create or replace function public.enforce_guide_moderation()
returns trigger
language plpgsql
as $$
declare
  combined text;
  normalized text;
begin
  combined := concat_ws(' ', new.title, new.star_power, new.gadget, new.gears, new.synergies, new.counters, new.body);

  -- Block external links, scams, hacks, illegal/harmful phrases, and script injection
  if combined ~* '(https?://|www\.|discord\.gg/|t\.me/|bit\.ly/|tinyurl\.com/|<\s*script|javascript:|onerror\s*=|onload\s*=)' then
    raise exception 'External links and HTML scripts are not allowed in guides.';
  end if;

  if combined ~* '\m(free\s*gems?|gem\s*generator|brawl\s*hack|mod\s*apk|cheat\s*engine|account\s*for\s*sale|sell(?:ing)?\s*account|buy\s*account|cracked\s*account|steal\s*account|hack\s*account|ip\s*grabber|ddos|doxx?(?:ing)?|swat(?:ting)?|carding|phishing|ransomware|keylogger|csam|cp\s*links?|child\s*porn|pedophile|kill\s*yourself|kys|commit\s*suicide|bomb\s*making|how\s*to\s*make\s*a\s*bomb|buy\s*cocaine|buy\s*heroin|buy\s*meth|buy\s*fentanyl|sell\s*drugs|buy\s*drugs|buy\s*illegal\s*guns?|mass\s*shooting|terrorism|terrorist\s*attack)\M' then
    raise exception 'Prohibited or illegal content detected.';
  end if;

  -- Normalize leetspeak & Turkish characters and block swear words / slurs (EN + TR)
  normalized := translate(replace(lower(combined), chr(775), ''), '@431!|0$57çğıöşü', 'aaeiiiosstcgiosu');
  if combined ~* '\m(fuck|fucker|fucking|fucked|motherfucker|shit|bullshit|shitty|bitch|bitches|bastard|asshole|dickhead|cunt|whore|slut|cocksucker|nigger|nigga|faggot|fag|retard|retarded|rape|rapist|nazi|hitler|porn|pornhub|xvideos|hentai|blowjob|handjob|amk|aq|amq|orospu|oruspu|oç|oc|piç|piçlik|piclik|siktir|sikim|sikeyim|sikerim|sikik|yarrak|yarak|göt|götveren|gotveren|kahpe|pezevenk|ibne|gavat|yavşak|yavsak|şerefsiz|serefsiz|ananı|anani)\M'
     or normalized ~* '\m(fuck|fucker|fucking|fucked|motherfucker|shit|bullshit|shitty|bitch|bitches|bastard|asshole|dickhead|cunt|whore|slut|cocksucker|nigger|nigga|faggot|fag|retard|retarded|rape|rapist|nazi|hitler|porn|pornhub|xvideos|hentai|blowjob|handjob|amk|aq|amq|orospu|oruspu|oc|piclik|siktir|sikim|sikeyim|sikerim|sikik|yarrak|yarak|gotveren|kahpe|pezevenk|ibne|gavat|yavsak|serefsiz|anani)\M' then
    raise exception 'Please remove swear words or offensive language before publishing.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guides_moderation on public.guides;
create trigger trg_guides_moderation
  before insert or update on public.guides
  for each row execute function public.enforce_guide_moderation();

-- 6. Ensure logged-out (anon) visitors can read all guides & votes publicly
grant usage on schema public to anon, authenticated;
grant select on public.guides, public.guide_votes, public.profiles to anon, authenticated;
grant insert, update, delete on public.guides, public.guide_votes, public.profiles to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- OPTIONAL: Make yourself an Admin (can moderate/delete any spam guide)
-- After signing in once with your Google account, run:
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL@gmail.com');
-- ============================================================================
