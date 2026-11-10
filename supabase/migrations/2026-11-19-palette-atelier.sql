-- Palette « Atelier+ » (9 nov. 2026) : cinq verres → six. Les anciens verres sont ramenés au nouveau le plus proche
-- (même correspondance que LEGACY_GLASSES dans lib/theme.ts). L'ambre ne change pas ; le corail est nouveau.
-- Sans danger si on la relance : les nouvelles couleurs ne bougent plus. Aucune structure modifiée ;
-- updated_at n'est pas touché (le donateur n'a rien fait).
update donors set color = case upper(color)
    when '#E0657F' then '#F59AC5' -- rose      → rose
    when '#3DB5A6' then '#1FA978' -- turquoise → jade
    when '#6A78E6' then '#5CC0F5' -- indigo    → ciel
    when '#A56BD9' then '#9450CC' -- violet    → violet
    else color
  end
where upper(color) in ('#E0657F', '#3DB5A6', '#6A78E6', '#A56BD9');

-- Contrôle : toute couleur restante hors de la palette (devrait renvoyer 0 ligne)
select color, count(*) from donors
where upper(color) not in ('#F0B24A', '#EA6646', '#1FA978', '#5CC0F5', '#9450CC', '#F59AC5')
group by color;
