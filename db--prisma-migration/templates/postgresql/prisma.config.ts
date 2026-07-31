import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const config = () => {
  console.log('process.env.DATABASE_URL!', process.env.DATABASE_URL!)
  return defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
      path: 'prisma/migrations',
    },
    datasource: {
      url: process.env.DATABASE_URL!,
    },
  })
}

export default config
