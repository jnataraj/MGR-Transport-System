const prisma = require("../src/prisma/prisma");

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudentMissingAlert" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "studentId" TEXT NOT NULL,
      "studentName" TEXT NOT NULL,
      "studentRollNo" TEXT,
      "driverId" TEXT,
      "driverName" TEXT,
      "vehicleId" TEXT NOT NULL,
      "vehicleNumber" TEXT NOT NULL,
      "driverLat" DOUBLE PRECISION NOT NULL,
      "driverLng" DOUBLE PRECISION NOT NULL,
      "studentLat" DOUBLE PRECISION NOT NULL,
      "studentLng" DOUBLE PRECISION NOT NULL,
      "distanceMeters" DOUBLE PRECISION NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "stage" TEXT,
      "alertTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt" TIMESTAMP(3),
      "resolvedReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudentMissingAlert_studentId_idx" ON "StudentMissingAlert"("studentId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudentMissingAlert_vehicleId_idx" ON "StudentMissingAlert"("vehicleId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudentMissingAlert_status_idx" ON "StudentMissingAlert"("status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudentMissingAlert_alertTime_idx" ON "StudentMissingAlert"("alertTime");
  `);

  console.log("✅ StudentMissingAlert table and indexes successfully initialized.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
