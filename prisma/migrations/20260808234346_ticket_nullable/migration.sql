-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT,
    "eventId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "source" TEXT NOT NULL DEFAULT 'ONLINE',
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckIn_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckIn" ("agentId", "eventId", "id", "lat", "lng", "scannedAt", "source", "status", "ticketId") SELECT "agentId", "eventId", "id", "lat", "lng", "scannedAt", "source", "status", "ticketId" FROM "CheckIn";
DROP TABLE "CheckIn";
ALTER TABLE "new_CheckIn" RENAME TO "CheckIn";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
