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
