insert into public.weeks (
  season, nfl_week, status, first_manager_id,
  draft_opens_at, draft_closes_at, captain_locks_at
) values (
  2026, 1, 'scheduled', 'ec754195-3838-4986-9b84-6d8b6d9dadcd',
  '2026-09-07 07:00:00+00',
  '2026-09-09 23:59:00+00',
  '2026-09-10 00:20:00+00'
)
on conflict (season, nfl_week) do update set
  first_manager_id = excluded.first_manager_id,
  draft_opens_at = excluded.draft_opens_at,
  draft_closes_at = excluded.draft_closes_at,
  captain_locks_at = excluded.captain_locks_at;

insert into public.nfl_players (id, full_name, position, nfl_team, status, provider_payload)
values
  ('1','Josh Allen','QB','BUF','healthy','{"mock":true}'), ('2','Lamar Jackson','QB','BAL','healthy','{"mock":true}'),
  ('3','Jalen Hurts','QB','PHI','questionable','{"mock":true}'), ('4','Joe Burrow','QB','CIN','healthy','{"mock":true}'),
  ('5','Bijan Robinson','RB','ATL','healthy','{"mock":true}'), ('6','Saquon Barkley','RB','PHI','healthy','{"mock":true}'),
  ('7','Jahmyr Gibbs','RB','DET','healthy','{"mock":true}'), ('8','Christian McCaffrey','RB','SF','questionable','{"mock":true}'),
  ('9','Breece Hall','RB','NYJ','healthy','{"mock":true}'), ('10','Derrick Henry','RB','BAL','healthy','{"mock":true}'),
  ('11','James Cook','RB','BUF','doubtful','{"mock":true}'), ('12','CeeDee Lamb','WR','DAL','healthy','{"mock":true}'),
  ('13','Ja''Marr Chase','WR','CIN','healthy','{"mock":true}'), ('14','Justin Jefferson','WR','MIN','healthy','{"mock":true}'),
  ('15','Amon-Ra St. Brown','WR','DET','questionable','{"mock":true}'), ('16','Puka Nacua','WR','LAR','healthy','{"mock":true}'),
  ('17','A.J. Brown','WR','PHI','healthy','{"mock":true}'), ('18','Nico Collins','WR','HOU','healthy','{"mock":true}'),
  ('19','Brock Bowers','TE','LV','healthy','{"mock":true}'), ('20','Trey McBride','TE','ARI','healthy','{"mock":true}'),
  ('21','George Kittle','TE','SF','questionable','{"mock":true}'), ('22','Sam LaPorta','TE','DET','healthy','{"mock":true}')
on conflict (id) do nothing;

insert into public.week_players (week_id, player_id, opponent, projection, ranking, available)
select w.id, p.id,
  case p.id
    when '1' then 'vs BAL' when '2' then '@ BUF' when '3' then 'vs DAL' when '4' then '@ CLE'
    when '5' then 'vs TB' when '6' then 'vs DAL' when '7' then '@ GB' when '8' then 'vs SEA'
    when '9' then 'vs NE' when '10' then '@ BUF' when '11' then 'vs BAL' when '12' then '@ PHI'
    when '13' then '@ CLE' when '14' then 'vs CHI' when '15' then '@ GB' when '16' then 'vs ARI'
    when '17' then 'vs DAL' when '18' then 'vs IND' when '19' then '@ DEN' when '20' then '@ LAR'
    when '21' then 'vs SEA' else '@ GB' end,
  case p.id
    when '1' then 24.1 when '2' then 23.4 when '3' then 22.8 when '4' then 21.9
    when '5' then 19.8 when '6' then 19.2 when '7' then 18.7 when '8' then 18.2
    when '9' then 17.4 when '10' then 16.9 when '11' then 16.3 when '12' then 19.5
    when '13' then 19.1 when '14' then 18.8 when '15' then 18.1 when '16' then 17.6
    when '17' then 17.2 when '18' then 16.7 when '19' then 14.7 when '20' then 14.1
    when '21' then 13.6 else 12.8 end,
  p.id::integer, true
from public.weeks w cross join public.nfl_players p
where w.season = 2026 and w.nfl_week = 1 and (p.provider_payload ->> 'mock')::boolean
on conflict (week_id, player_id) do nothing;

create or replace function public.select_captain(p_week_id uuid, p_player_id text)
returns public.captains
language plpgsql
security definer
set search_path = public
as $$
declare v_result public.captains;
begin
  if not exists (select 1 from public.weeks where id = p_week_id and now() < captain_locks_at) then raise exception 'Captain selection is locked'; end if;
  if not exists (select 1 from public.draft_picks where week_id = p_week_id and manager_id = auth.uid() and player_id = p_player_id) then raise exception 'Captain must be on your roster'; end if;
  insert into public.captains (week_id, manager_id, player_id) values (p_week_id, auth.uid(), p_player_id)
  on conflict (week_id, manager_id) do update set player_id = excluded.player_id, selected_at = now()
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.select_captain(uuid, text) from public;
grant execute on function public.select_captain(uuid, text) to authenticated;

alter publication supabase_realtime add table public.captains;
