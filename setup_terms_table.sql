-- Create terms_acceptances table
create table if not exists public.terms_acceptances (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  terms_version text not null,
  accepted_at timestamptz default now() not null,
  ip_address text,
  user_agent text,
  
  -- Prevent duplicate acceptances for the same version
  unique(user_id, terms_version)
);

-- Enable RLS
alter table public.terms_acceptances enable row level security;

-- Policies
-- User can view their own acceptances
create policy "Users can view own acceptances"
  on public.terms_acceptances for select
  using (auth.uid() = user_id);

-- User can insert their own acceptance (Server will likely do this with service key, but good to have)
create policy "Users can insert own acceptances"
  on public.terms_acceptances for insert
  with check (auth.uid() = user_id);

-- Grants
grant select, insert on public.terms_acceptances to authenticated, service_role;
