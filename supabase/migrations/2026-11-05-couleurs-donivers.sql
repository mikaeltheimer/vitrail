-- Palette Donivers : les dix anciens verres sont ramenés au plus proche des cinq nouveaux
-- (ambre #F0B24A, rose #E0657F, turquoise #3DB5A6, indigo #6A78E6, violet #A56BD9).
-- À exécuter une fois dans le SQL Editor de Supabase (sans danger si on le relance : les nouvelles couleurs ne bougent plus).
update donors set color = case lower(color)
    when '#f472b6' then '#E0657F' -- rose      → rose
    when '#f87171' then '#E0657F' -- rouge     → rose
    when '#d946ef' then '#A56BD9' -- fuchsia   → violet
    when '#7c3aed' then '#A56BD9' -- violet    → violet
    when '#60a5fa' then '#6A78E6' -- bleu      → indigo
    when '#22d3ee' then '#3DB5A6' -- turquoise → turquoise
    when '#16a34a' then '#3DB5A6' -- émeraude  → turquoise
    when '#a3e635' then '#3DB5A6' -- lime      → turquoise
    when '#facc15' then '#F0B24A' -- jaune     → ambre
    when '#fb923c' then '#F0B24A' -- orange    → ambre
    else color
  end,
  updated_at = now()
where lower(color) in ('#f472b6', '#f87171', '#d946ef', '#7c3aed', '#60a5fa', '#22d3ee', '#16a34a', '#a3e635', '#facc15', '#fb923c');

-- Contrôle : toute couleur restante hors de la palette (devrait renvoyer 0 ligne)
select color, count(*) from donors
where color not in ('#F0B24A', '#E0657F', '#3DB5A6', '#6A78E6', '#A56BD9')
group by color;
