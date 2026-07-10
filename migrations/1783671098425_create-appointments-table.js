/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createType('appointment_status', [
    'scheduled',
    'completed',
    'cancelled',
    'no_show',
  ]);

  pgm.createTable('appointments', {
    appointment_id: 'id',
    customer_id: {
      type: 'integer',
      notNull: true,
      references: 'customers',
      onDelete: 'CASCADE',
    },
    employee_id: {
      type: 'integer',
      references: 'employees',
      onDelete: 'SET NULL',
    },
    service_id: {
      type: 'integer',
      notNull: true,
      references: 'services',
      onDelete: 'RESTRICT',
    },
    start_time: { type: 'timestamp', notNull: true },
    status: {
      type: 'appointment_status',
      notNull: true,
      default: 'scheduled',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('appointments');
  pgm.dropType('appointment_status');
};