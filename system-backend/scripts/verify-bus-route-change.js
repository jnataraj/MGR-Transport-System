const jwt = require("jsonwebtoken");
const prisma = require("../src/prisma/prisma");
const request = require("http");

async function runVerification() {
  console.log("=== CTMS BUS/ROUTE CHANGE END-TO-END VERIFICATION ===");

  try {
    // 1. Find or create test Driver and test Student
    let driver = await prisma.user.findFirst({
      where: { role: { equals: "driver", mode: "insensitive" } },
      include: { vehicles: true },
    });

    let student = await prisma.user.findFirst({
      where: { role: { equals: "student", mode: "insensitive" } },
      include: { studentAssignments: { include: { vehicle: true } } },
    });

    let student2 = await prisma.user.findFirst({
      where: {
        role: { equals: "student", mode: "insensitive" },
        id: { not: student?.id },
      },
      include: { studentAssignments: { include: { vehicle: true } } },
    });

    console.log("Driver found:", driver?.name, driver?.id);
    console.log("Student 1 found:", student?.name, student?.id);
    console.log("Student 2 found:", student2?.name, student2?.id);

    // Ensure driver has a vehicle
    let driverVehicle = driver?.vehicles?.[0];
    if (!driverVehicle) {
      driverVehicle = await prisma.vehicle.findFirst({
        where: { driverId: driver.id },
      });
    }

    if (!driverVehicle) {
      driverVehicle = await prisma.vehicle.findFirst();
      if (driverVehicle && driver) {
        await prisma.vehicle.update({
          where: { id: driverVehicle.id },
          data: { driverId: driver.id },
        });
      }
    }

    console.log("Driver Vehicle (Target Bus):", driverVehicle?.number, driverVehicle?.id);

    // Ensure student has a starting vehicle different from driverVehicle
    const startingVehicle = await prisma.vehicle.findFirst({
      where: { id: { not: driverVehicle.id } },
    });

    if (startingVehicle && student) {
      await prisma.vehicleStudentAssignment.deleteMany({ where: { studentId: student.id } });
      await prisma.vehicleStudentAssignment.create({
        data: {
          vehicleId: startingVehicle.id,
          studentId: student.id,
          studentName: student.name,
          assignedBy: "admin",
        },
      });
      console.log("Student initial assignment set to:", startingVehicle.number);
    }

    if (startingVehicle && student2) {
      await prisma.vehicleStudentAssignment.deleteMany({ where: { studentId: student2.id } });
      await prisma.vehicleStudentAssignment.create({
        data: {
          vehicleId: startingVehicle.id,
          studentId: student2.id,
          studentName: student2.name,
          assignedBy: "admin",
        },
      });
      console.log("Student 2 initial assignment set to:", startingVehicle.number);
    }

    // Generate JWT tokens
    const driverToken = jwt.sign(
      { id: driver.id, email: driver.email, role: driver.role },
      process.env.JWT_SECRET || "CTMS_SECRET_KEY"
    );

    const studentToken = jwt.sign(
      { id: student.id, email: student.email, role: student.role },
      process.env.JWT_SECRET || "CTMS_SECRET_KEY"
    );

    const student2Token = student2 ? jwt.sign(
      { id: student2.id, email: student2.email, role: student2.role },
      process.env.JWT_SECRET || "CTMS_SECRET_KEY"
    ) : null;

    // Helper for HTTP requests
    const app = require("../src/app");
    const http = require("http");
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(5099, resolve));
    console.log("Test server listening on port 5099");

    const makeRequest = (path, method = "GET", body = null, token = null) => {
      return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : "";
        const options = {
          hostname: "localhost",
          port: 5099,
          path,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };

        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, raw: data });
            }
          });
        });

        req.on("error", reject);
        if (postData) req.write(postData);
        req.end();
      });
    };

    // Step A: Driver generates Common QR session
    console.log("\n--- STEP A: Driver generates Common QR Session ---");
    const qrRes = await makeRequest("/api/bus-route-change/qr/session", "POST", { forceNew: true }, driverToken);
    console.log("QR Session Response:", qrRes.status, qrRes.data?.success, "Token:", qrRes.data?.data?.sessionToken);
    if (!qrRes.data?.success) throw new Error("Failed to generate driver QR session");

    const sessionToken = qrRes.data.data.sessionToken;

    // Step B: Student 1 scans and validates QR Code
    console.log("\n--- STEP B: Student 1 validates scanned QR ---");
    const validateRes = await makeRequest(
      "/api/bus-route-change/qr/validate",
      "POST",
      { token: `BUS_ROUTE_CHANGE:${sessionToken}` },
      studentToken
    );
    console.log("Validation Response:", validateRes.status, validateRes.data?.success);
    console.log("Old Bus:", validateRes.data?.data?.currentAssignment?.busNumber, "-> New Bus:", validateRes.data?.data?.newAssignment?.busNumber);
    if (!validateRes.data?.success) throw new Error("Failed to validate QR");

    // Step C: Student 1 confirms Bus/Route change
    console.log("\n--- STEP C: Student 1 confirms Bus/Route Change ---");
    const confirmRes = await makeRequest(
      "/api/bus-route-change/confirm",
      "POST",
      {
        sessionToken,
        remarks: "Test switch to college bus",
        studentLat: 13.0827,
        studentLng: 80.2707,
      },
      studentToken
    );
    console.log("Confirm Response:", confirmRes.status, confirmRes.data?.success);
    console.log("Reference ID:", confirmRes.data?.data?.referenceNumber);
    console.log("Assigned to:", confirmRes.data?.data?.newBusNumber);
    if (!confirmRes.data?.success) throw new Error("Failed to confirm bus change");

    // Step D: Verify Student 1 DB assignment & history record
    console.log("\n--- STEP D: Verify DB Assignment and History ---");
    const updatedAssignment = await prisma.vehicleStudentAssignment.findFirst({
      where: { studentId: student.id },
      include: { vehicle: true },
    });
    console.log("Student DB Active Bus:", updatedAssignment?.vehicle?.number);
    if (updatedAssignment?.vehicleId !== driverVehicle.id) {
      throw new Error(`Expected student active bus to be ${driverVehicle.id}, got ${updatedAssignment?.vehicleId}`);
    }

    const historyRecord = await prisma.busRouteChangeHistory.findUnique({
      where: { referenceNumber: confirmRes.data.data.referenceNumber },
    });
    console.log("History Record Found:", historyRecord?.referenceNumber, "Status:", historyRecord?.status);
    if (!historyRecord) throw new Error("History record not created!");

    // Step E: Student 2 uses the SAME COMMON QR session (Multi-Student Common QR test)
    if (student2 && student2Token) {
      console.log("\n--- STEP E: Multi-Student Common QR Test (Student 2) ---");
      const validate2 = await makeRequest(
        "/api/bus-route-change/qr/validate",
        "POST",
        { token: sessionToken },
        student2Token
      );
      console.log("Student 2 Validate:", validate2.data?.success);

      const confirm2 = await makeRequest(
        "/api/bus-route-change/confirm",
        "POST",
        { sessionToken, remarks: "Student 2 common QR scan" },
        student2Token
      );
      console.log("Student 2 Confirm:", confirm2.data?.success, "Ref:", confirm2.data?.data?.referenceNumber);
      if (!confirm2.data?.success) throw new Error("Common QR multi-student use failed!");
    }

    // Step F: Test Admin History endpoint
    console.log("\n--- STEP F: Admin History API ---");
    const adminHistory = await makeRequest("/api/bus-route-change/history", "GET", null, driverToken);
    console.log("Admin History count:", adminHistory.data?.data?.length);
    if (!adminHistory.data?.data || adminHistory.data?.data?.length === 0) {
      throw new Error("Admin history endpoint returned empty data");
    }

    // Step G: Test Student My History endpoint
    console.log("\n--- STEP G: Student My History API ---");
    const myHistory = await makeRequest("/api/bus-route-change/history/my", "GET", null, studentToken);
    console.log("Student My History records:", myHistory.data?.data?.length);

    console.log("\n========================================================");
    console.log(">>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<");
    console.log("========================================================");

    server.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ VERIFICATION FAILED:", error);
    process.exit(1);
  }
}

runVerification();
