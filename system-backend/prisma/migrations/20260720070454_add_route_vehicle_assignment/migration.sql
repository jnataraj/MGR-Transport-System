-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VehicleCoordinatorAssignment" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedBy" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN     "coordinatorName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "VehicleStudentAssignment" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assignedBy" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN     "class" TEXT,
ADD COLUMN     "pickupPoint" TEXT,
ADD COLUMN     "studentName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "VehicleAssignmentAuditLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "adminId" TEXT NOT NULL DEFAULT 'admin',
    "adminName" TEXT NOT NULL DEFAULT 'Super Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleAssignmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vehicleId" TEXT,
    "reportedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverName" TEXT NOT NULL,
    "driverId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceAlert" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "raisedBy" TEXT NOT NULL DEFAULT 'Admin',
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusShutdown" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "replacementBus" TEXT,
    "affectedRoute" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'High',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusShutdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentVehicleMapping" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "originalVehicleId" TEXT NOT NULL,
    "activeVehicleId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "pickupLocation" TEXT,
    "dropLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentVehicleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusAssignment" (
    "id" TEXT NOT NULL,
    "fromVehicleId" TEXT NOT NULL,
    "fromVehicleNumber" TEXT NOT NULL,
    "toVehicleId" TEXT NOT NULL,
    "toVehicleNumber" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoRestoreAt" TIMESTAMP(3),
    "studentsJson" TEXT NOT NULL DEFAULT '[]',
    "parentsJson" TEXT NOT NULL DEFAULT '[]',
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "parentCount" INTEGER NOT NULL DEFAULT 0,
    "previousDriverId" TEXT,
    "previousDriverName" TEXT,
    "newDriverId" TEXT,
    "newDriverName" TEXT,
    "previousRoute" TEXT,
    "newRoute" TEXT,
    "previousCoordinatorId" TEXT,
    "newCoordinatorId" TEXT,
    "adminId" TEXT NOT NULL DEFAULT 'admin',
    "adminName" TEXT NOT NULL DEFAULT 'Super Admin',
    "ipAddress" TEXT,
    "notificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "gpsSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "attendanceSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "transactionStatus" TEXT NOT NULL DEFAULT 'success',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusChangeAuditLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "fromVehicle" TEXT NOT NULL,
    "toVehicle" TEXT NOT NULL,
    "previousDriver" TEXT,
    "newDriver" TEXT,
    "previousRoute" TEXT,
    "newRoute" TEXT,
    "assignmentType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "restorationDate" TIMESTAMP(3),
    "studentsAffected" INTEGER NOT NULL DEFAULT 0,
    "parentsNotified" INTEGER NOT NULL DEFAULT 0,
    "notificationStatus" TEXT NOT NULL DEFAULT 'sent',
    "gpsSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "attendanceSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "transactionStatus" TEXT NOT NULL DEFAULT 'success',
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusChangeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteVehicleAssignment" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL DEFAULT 'admin',
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "RouteVehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteNotification" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "vehicleIdsJson" TEXT NOT NULL DEFAULT '[]',
    "vehicleNumbersJson" TEXT NOT NULL DEFAULT '[]',
    "notificationType" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "effectiveTime" TEXT NOT NULL,
    "duration" TEXT,
    "updatedRoute" TEXT,
    "pickupChange" TEXT,
    "dropChange" TEXT,
    "customMessage" TEXT,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "totalParents" INTEGER NOT NULL DEFAULT 0,
    "totalDrivers" INTEGER NOT NULL DEFAULT 0,
    "totalCoordinators" INTEGER NOT NULL DEFAULT 0,
    "totalHods" INTEGER NOT NULL DEFAULT 0,
    "stakeholdersJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "adminId" TEXT NOT NULL DEFAULT 'admin',
    "adminName" TEXT NOT NULL DEFAULT 'Super Admin',
    "ipAddress" TEXT,
    "gpsSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "attendanceSyncStatus" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleGPSLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "driverId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION DEFAULT 0,
    "heading" DOUBLE PRECISION,
    "isHalted" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleGPSLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTransit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL DEFAULT '',
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "department" TEXT,
    "year" TEXT,
    "hodEmail" TEXT,
    "boardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "droppedAt" TIMESTAMP(3),
    "boardLat" DOUBLE PRECISION,
    "boardLng" DOUBLE PRECISION,
    "dropLat" DOUBLE PRECISION,
    "dropLng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'in_transit',
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentTransit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleHalt" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "driverId" TEXT,
    "driverName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "haltReason" TEXT NOT NULL DEFAULT 'other',
    "customReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleHalt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentVehicleMapping_studentId_key" ON "StudentVehicleMapping"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteVehicleAssignment_routeId_vehicleId_key" ON "RouteVehicleAssignment"("routeId", "vehicleId");

-- CreateIndex
CREATE INDEX "VehicleGPSLog_vehicleId_idx" ON "VehicleGPSLog"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleGPSLog_recordedAt_idx" ON "VehicleGPSLog"("recordedAt");

-- CreateIndex
CREATE INDEX "StudentTransit_studentId_idx" ON "StudentTransit"("studentId");

-- CreateIndex
CREATE INDEX "StudentTransit_vehicleId_idx" ON "StudentTransit"("vehicleId");

-- CreateIndex
CREATE INDEX "StudentTransit_date_idx" ON "StudentTransit"("date");

-- CreateIndex
CREATE INDEX "StudentTransit_status_idx" ON "StudentTransit"("status");

-- CreateIndex
CREATE INDEX "VehicleHalt_vehicleId_idx" ON "VehicleHalt"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleHalt_status_idx" ON "VehicleHalt"("status");

-- CreateIndex
CREATE INDEX "VehicleHalt_startedAt_idx" ON "VehicleHalt"("startedAt");
