# Clear Technology Solutions — Invoicing

Private, single-business workspace. USD amounts are stored as integer cents. Hours and quantities support two decimal places. Invoice numbers use a database auto-incrementing sequence; records are retained when voided.

## Workflow
1. Add a customer, physical/mailing addresses, contact details, and regular/helpdesk/after-hours rates.
2. Log purchases with quantity, unit cost, unit selling price, and an optional PNG/JPEG/WebP/PDF receipt (5 MB maximum). Paste screenshots into the receipt box.
3. Create a draft invoice for a customer. Add hours by category or products. Review line descriptions, rates, dates and total.
4. Finalize to lock the invoice. Finalizing does not send email. Print / PDF opens the browser print dialog; choose Save as PDF. Mark paid records full payment only. Void retains the historical record.
5. Download a full backup from Backups regularly.

Historical invoices snapshot customer details and rates. Internal cost, customer notes, and receipts do not appear in the printed customer invoice. Rates can be overridden per draft line. Tax defaults to zero; an optional user-entered percentage applies to all lines. This is simple invoicing, not an accounting ledger or tax determination service. No payment gateway or automatic email sending is configured.

## Storage and backups
D1 tables: customers, invoices, purchases, receipts. The data columns hold version-validated record JSON; receipts contains file metadata. R2 holds receipt bytes under receipts/<id>. Receipt replacements leave the original file retained in storage and backups.

The full JSON backup embeds all receipt bytes as base64. Download failure or interrupted transfer means the file must not be treated as a complete backup. Validate a backup by restoring into a separate empty workspace. Browser restore supports at most 25 MB / 1,000 records (including receipts), validates relationships and data, restores receipt bytes, then commits the database changes atomically. It never replaces populated databases.

For larger datasets on your Cloudflare account, export D1 SQL (wrangler d1 export <database-name> --remote --output backup.sql) and copy the complete R2 bucket using an S3-compatible client. Restore SQL into an empty D1 database and restore objects with the original receipts/ keys. Both are required. Neither browser backups nor provider SQL exports alone replace an off-account backup strategy.

## Hosting
The private Sites version relies on the platform's owner-only access boundary. Do not make this private financial workspace public. Source: Vinext / React / TypeScript / Cloudflare D1 / R2.

The supplied standalone Cloudflare bundle forces external authentication and requires ADMIN_PASSWORD (12+ characters). Never place the password in source or Git. Configure it as a Worker runtime secret. Exported application files contain no customer data or secrets.

## Checks
node tests/run.mjs
node node_modules/typescript/bin/tsc --noEmit

Tests exercise invoice math, rounding, snapshots, finalized edit rejection, statuses, receipt bytes, backup/restore, numbering, origin checks and authentication using a real in-memory SQLite database adapter and a mocked object store. These are not browser end-to-end tests.

## Product sales and branding update
Purchases are assigned to a customer. Add a saved purchase to that customer's invoice and enter the unit sale price on the invoice line. The purchase record derives actual revenue, profit and markup from linked finalized/paid invoices; drafts are pending and void invoices are excluded. Markup = (sale revenue - cost of billed quantity) / cost of billed quantity × 100, excluding tax. Zero-cost sales display no percentage. Multiple invoice sales are aggregated with a quantity-weighted cost basis. Linked invoice lines snapshot unit cost when saved; later purchase-cost changes do not rewrite existing snapshots. Legacy invoice lines without a cost snapshot use the saved purchase cost.

The invoice uses the CTS website's mountain/sun mark and forest-green, sage and sand palette, with a white print layout and branded footer.
