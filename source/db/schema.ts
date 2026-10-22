import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const customers = sqliteTable('customers', {id:text('id').primaryKey(), data:text('data').notNull(), updated:integer('updated').notNull()});
export const purchases = sqliteTable('purchases', {id:text('id').primaryKey(), data:text('data').notNull(), updated:integer('updated').notNull()});
export const invoices = sqliteTable('invoices', {id:integer('id').primaryKey({autoIncrement:true}), data:text('data').notNull(), updated:integer('updated').notNull()});
export const receipts = sqliteTable('receipts', {id:text('id').primaryKey(), name:text('name').notNull(), type:text('type').notNull(), size:integer('size').notNull()});
