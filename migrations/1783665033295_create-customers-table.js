/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * UP = apply this migration = create the customers table
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('customers', {
    customer_id: 'id', // shorthand for auto-incrementing integer PRIMARY KEY
    name: { type: 'varchar(100)', notNull: true },
    phone: { type: 'varchar(20)', notNull: true },
    address: { type: 'varchar(255)' }, // optional, so no notNull
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'), // Postgres auto-fills this on insert
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
};

/**
 * DOWN = reverse this migration = undo what UP did = drop the table
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('customers');
};