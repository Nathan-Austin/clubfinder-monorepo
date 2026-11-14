-- One line per column, index and constraint of the clubfindr schema, in a stable order.
-- Two databases whose schemas match print the same lines. Used by dev/check-migrations.sh
-- (before and after the migrations) and dev/setup.sh (the dev database against a scratch copy
-- built from dev/schema.sql, KNOWN_ISSUES 60). Read-only.
SET search_path = clubfindr;
SELECT kind || ' ' || detail FROM (
	SELECT 'column' AS kind,
	       table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable
	         || ' default=' || coalesce(column_default, '') AS detail
	FROM information_schema.columns WHERE table_schema = 'clubfindr'
	UNION ALL
	SELECT 'index', indexname || ' ' || indexdef
	FROM pg_indexes WHERE schemaname = 'clubfindr'
	UNION ALL
	SELECT 'constraint', conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
	FROM pg_constraint WHERE connamespace = 'clubfindr'::regnamespace
) catalog
ORDER BY 1;
