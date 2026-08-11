insert into public.profiles (id, display_name)
values
  ('ec754195-3838-4986-9b84-6d8b6d9dadcd', 'Justin'),
  ('9f545b9e-78dc-4b88-80c0-336ad29464e2', 'Luke')
on conflict (id) do update
set display_name = excluded.display_name;
