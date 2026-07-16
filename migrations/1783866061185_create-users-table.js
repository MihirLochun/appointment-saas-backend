export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createType('user_role', ['owner', 'staff']);

  pgm.createTable('users', {
    user_id: 'id',
    name: { type: 'varchar(100)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role: { type: 'user_role', notNull: true, default: 'staff' },
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

export const down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropType('user_role');
};

