export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createTable('businesses', {
    business_id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    slug: { type: 'varchar(255)', notNull: true, unique: true },
    description: { type: 'text' },
    logo_url: { type: 'varchar(500)' },
    settings: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  // Seed business #1, representing your existing test data, so nothing
  // orphaned is left behind once we add business_id to every other table.
  pgm.sql(`
    INSERT INTO businesses (name, slug, description)
    VALUES ('Demo Barbershop', 'demo-barbershop', 'Our original test business')
  `);
};

export const down = (pgm) => {
  pgm.dropTable('businesses');
};