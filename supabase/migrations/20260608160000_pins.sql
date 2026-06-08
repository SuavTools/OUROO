-- Pinned message per channel (editable by moderators).
alter table channels add column if not exists pinned text;

drop policy if exists "mods update channels" on channels;
create policy "mods update channels" on channels for update to authenticated
  using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));

-- SUAV's welcome pin on #geral.
update channels set pinned = $pin$Bem-vindos a este espaço de escuta e partilha.
Este site é a central criativa do meu projeto. Fiquem por aqui e vejam o espaço a crescer todos os dias. Mais jogos, mais iniciativa. Comunidade (mas a sério). A ideia é tirar a malta das redes para aqui.
Tenho datas, tenho música, tenho jogos. Aos poucos vou percebendo o que é possível fazer daqui — não só para elevar ou promover a minha música, mas realmente criar iniciativas que recebem e dão de volta em dobro (mas a sério).
Na paz e na suavidade.
SUAV NA NAVE.
Assino.$pin$ where slug = 'geral';
