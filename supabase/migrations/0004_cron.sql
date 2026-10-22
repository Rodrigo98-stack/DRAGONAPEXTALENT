-- Pausa automática das vagas ao fim do período pago (de hora em hora).
-- Requer a extensão pg_cron (Database → Extensions → pg_cron). Se ela não estiver disponível,
-- esta migração apenas avisa e não falha.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('dat_pause_expired_jobs', '5 * * * *', 'select public.pause_expired_jobs()');
exception when others then
  raise notice 'pg_cron indisponível (%). Agende public.pause_expired_jobs() manualmente.', sqlerrm;
end $$;
