import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const password = await bcrypt.hash('admin123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@flex.app' },
    update: {},
    create: {
      email: 'admin@flex.app',
      name: 'Администратор',
      password,
    },
  });

  console.log('Seed completed. Admin user created:', user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
