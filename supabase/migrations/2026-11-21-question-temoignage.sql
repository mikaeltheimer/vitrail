-- La question à laquelle répond le témoignage d'un donateur, copiée au moment où il l'écrit : un organisme peut changer ou
-- multiplier ses questions sans qu'un ancien témoignage se retrouve sous une question qu'on ne lui a jamais posée.
-- Vide pour les témoignages écrits avant cette migration (affichés sans question). Ajout seulement ; sans danger si on la relance.
alter table public.donors
  add column if not exists message_question text
  constraint donors_message_question_check check (char_length(message_question) <= 120);
