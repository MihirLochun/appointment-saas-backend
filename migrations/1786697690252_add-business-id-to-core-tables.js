export const shorthands = undefined;

export const up = (pgm) => {
  const tables = ['users', 'customers', 'employees', 'services', 'appointments'];

  for (const table of tables) {
    // Step 1: add the column as NULLABLE first -- we can't add a NOT NULL
    // column to a table that already has rows without a default, since
    // Postgres wouldn't know what to put in existing rows.
    pgm.addColumn(table, {
      business_id: { type: 'integer', references: 'businesses', onDelete: 'RESTRICT' },
    });

    // Step 2: backfill every existing row to business #1 (business_id = 1,
    // since it's the very first row we inserted in the previous migration).
    pgm.sql(`UPDATE ${table} SET business_id = 1`);

    // Step 3: now that every row has a value, enforce NOT NULL going forward.
    pgm.alterColumn(table, 'business_id', { notNull: true });
  }
};

export const down = (pgm) => {
  const tables = ['users', 'customers', 'employees', 'services', 'appointments'];
  for (const table of tables) {
    pgm.dropColumn(table, 'business_id');
  }
};