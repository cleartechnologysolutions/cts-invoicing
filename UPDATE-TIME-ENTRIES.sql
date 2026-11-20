CREATE TABLE IF NOT EXISTS `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated` integer NOT NULL,
	`invoice_id` integer
);


CREATE TRIGGER IF NOT EXISTS time_entry_locked_update BEFORE UPDATE OF data,updated ON time_entries
WHEN OLD.invoice_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Remove time from its draft or void its invoice before editing.'); END;

CREATE TRIGGER IF NOT EXISTS time_entry_locked_delete BEFORE DELETE ON time_entries
WHEN OLD.invoice_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Invoiced time cannot be deleted.'); END;


CREATE TRIGGER IF NOT EXISTS invoice_time_insert AFTER INSERT ON invoices
BEGIN
 SELECT CASE WHEN json_extract(NEW.data,'$.status') != 'void' AND EXISTS (
  SELECT 1 FROM json_each(NEW.data,'$.lines') l
  WHERE COALESCE(json_extract(l.value,'$.timeEntryId'),'') != ''
  GROUP BY json_extract(l.value,'$.timeEntryId') HAVING COUNT(*)>1
 ) THEN RAISE(ABORT,'A time entry cannot appear twice on an invoice.') END;
 SELECT CASE WHEN json_extract(NEW.data,'$.status') != 'void' AND EXISTS (
  SELECT 1 FROM json_each(NEW.data,'$.lines') l
  LEFT JOIN time_entries t ON t.id=json_extract(l.value,'$.timeEntryId')
  WHERE COALESCE(json_extract(l.value,'$.timeEntryId'),'') != '' AND (
   t.id IS NULL OR (t.invoice_id IS NOT NULL AND t.invoice_id!=NEW.id)
   OR json_extract(t.data,'$.customerId')!=json_extract(NEW.data,'$.customerId')
   OR json_extract(l.value,'$.timeUpdated') IS NOT t.updated
  )
 ) THEN RAISE(ABORT,'Time entry changed or belongs to another invoice. Refresh and try again.') END;
 UPDATE time_entries SET invoice_id=NULL WHERE invoice_id=NEW.id;
 UPDATE time_entries SET invoice_id=NEW.id WHERE json_extract(NEW.data,'$.status')!='void'
 AND id IN (SELECT json_extract(value,'$.timeEntryId') FROM json_each(NEW.data,'$.lines'));
END;


CREATE TRIGGER IF NOT EXISTS invoice_time_update AFTER UPDATE OF data ON invoices
BEGIN
 SELECT CASE WHEN json_extract(NEW.data,'$.status') != 'void' AND EXISTS (
  SELECT 1 FROM json_each(NEW.data,'$.lines') l
  WHERE COALESCE(json_extract(l.value,'$.timeEntryId'),'') != ''
  GROUP BY json_extract(l.value,'$.timeEntryId') HAVING COUNT(*)>1
 ) THEN RAISE(ABORT,'A time entry cannot appear twice on an invoice.') END;
 SELECT CASE WHEN json_extract(NEW.data,'$.status') != 'void' AND EXISTS (
  SELECT 1 FROM json_each(NEW.data,'$.lines') l
  LEFT JOIN time_entries t ON t.id=json_extract(l.value,'$.timeEntryId')
  WHERE COALESCE(json_extract(l.value,'$.timeEntryId'),'') != '' AND (
   t.id IS NULL OR (t.invoice_id IS NOT NULL AND t.invoice_id!=NEW.id)
   OR json_extract(t.data,'$.customerId')!=json_extract(NEW.data,'$.customerId')
   OR json_extract(l.value,'$.timeUpdated') IS NOT t.updated
  )
 ) THEN RAISE(ABORT,'Time entry changed or belongs to another invoice. Refresh and try again.') END;
 UPDATE time_entries SET invoice_id=NULL WHERE invoice_id=NEW.id;
 UPDATE time_entries SET invoice_id=NEW.id WHERE json_extract(NEW.data,'$.status')!='void'
 AND id IN (SELECT json_extract(value,'$.timeEntryId') FROM json_each(NEW.data,'$.lines'));
END;

CREATE INDEX IF NOT EXISTS `time_entries_invoice_idx` ON `time_entries` (`invoice_id`);