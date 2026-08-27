# Moda Interact Admin

Moda Interact Admin is the internal platform administration console for the
Moda Interact platform. It provides a cross-merchant view of platform activity,
including usage, recovery performance, messaging volume and operational health.

The admin console is separate from the Shopify merchant application. The
merchant app is scoped to an individual shop, while this application is intended
for authorised platform administrators who need visibility across multiple
shops.

## Project summary

The project is built with Next.js App Router, TypeScript and Tailwind CSS. Its
main responsibilities are:

- platform-wide usage and billing visibility
- merchant activity and recovery reporting
- messaging and queue health monitoring
- internal support and investigation workflows
- secure server-side access to the shared PostgreSQL database

The application consumes the canonical Prisma schema through the nested
`moda-interact-database` submodule. Prisma migrations remain owned and managed
by that database project.

## Current status

The project is an early walking skeleton. The admin layout, dashboard views,
Prisma setup and database health endpoint are in place. Dashboard values are
currently representative data; authenticated platform-admin access and live
cross-merchant queries are the next implementation stage.

## Architecture

```text
Platform administrator
		  |
		  v
moda-interact-admin (Next.js)
		  |
		  v
Server-side Prisma queries
		  |
		  v
PostgreSQL
```

## Deployed application

[https://moda-interact-admin.vercel.app/](https://moda-interact-admin.vercel.app/)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Copy the environment template and set the database connection:

```bash
cp .env.example .env.local
```

Generate Prisma Client from the shared schema:

```bash
npm run prisma:generate
```

The database connectivity check is available at:

```text
/api/health/database
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
