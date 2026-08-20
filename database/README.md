# Database layer

This directory owns the PostgreSQL schema and migrations. The local development
database is the `db` service in the repository's `docker-compose.yml`.

Start it independently from the client and server:

```sh
docker compose up -d db
```

Use the `DATABASE_URL` shape in `.env.example` for server-side connections. Do
not put database credentials, schema ownership, or business-authoritative state
in the browser. This first scaffold deliberately includes no tables or real
data; later migrations must use only clearly marked synthetic demonstration
data.

The PostgreSQL schema lives at `server/prisma/schema.prisma` and is the
server-side source of truth for lessons, lesson credits, and orders.

Create the committed local schema and load only synthetic demonstration accounts with:

```sh
cd server
npx prisma migrate dev --name initial_schema
npx prisma db seed
```

The initial migration is committed at
`server/prisma/migrations/20260820000000_initial_schema/migration.sql`. For an
existing development database, use `npx prisma migrate deploy` to apply the
committed migration instead of creating another initial migration.

The seed integration test is explicitly isolated from the development database.
Copy `server/.env.test.example` to `server/.env.test`, create the disposable
`schedule_assistant_test` database, apply the committed migrations with that
`DATABASE_URL`, and run `npm test -- seed.test.js`. The test refuses to run
against any database name other than `schedule_assistant_test` and does not
delete records.

The seed creates a synthetic teacher, parent, and student records. It must
never be replaced with real student, parent, payment, or lesson data.
