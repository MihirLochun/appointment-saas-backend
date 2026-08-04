export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('business_hours', {
    day_of_week: { type: 'integer', primaryKey: true },
    is_closed: { type: 'boolean', notNull: true, default: false },
    open_time: { type: 'time' },
    close_time: { type: 'time' },
  });

  // Seed all 7 days with a sensible default (9 AM - 5 PM, closed Sunday)
  // right in the migration -- this guarantees the table is never empty,
  // which matters since our availability logic will assume a row always
  // exists for any given day.
  pgm.sql(`
    INSERT INTO business_hours (day_of_week, is_closed, open_time, close_time) VALUES
      (0, true, NULL, NULL),
      (1, false, '09:00', '17:00'),
      (2, false, '09:00', '17:00'),
      (3, false, '09:00', '17:00'),
      (4, false, '09:00', '17:00'),
      (5, false, '09:00', '17:00'),
      (6, false, '09:00', '13:00')
  `);
};

export const down = (pgm) => {
  pgm.dropTable('business_hours');
};