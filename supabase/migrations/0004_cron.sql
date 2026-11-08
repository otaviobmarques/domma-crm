create extension if not exists pg_cron;
select cron.schedule('domma-due-alerts', '*/5 * * * *', $$select public._due_alerts()$$);
