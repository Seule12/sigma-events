"use client";

import { openDB, DBSchema } from "idb";
import { OfflineEntry } from "@/app/actions";

export type CachedEvent = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  date: string;
};

export type CachedAgent = {
  id: string;
  name: string;
};

interface SigmaDB extends DBSchema {
  scans: {
    key: string;
    value: OfflineEntry;
  };
  eventCache: {
    key: string;
    value: CachedEvent;
  };
  agentCache: {
    key: string;
    value: CachedAgent;
  };
}

const DB_NAME = "sigma_security_local";
const DB_VERSION = 1;

const dbPromise = openDB<SigmaDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("scans")) {
      db.createObjectStore("scans", { keyPath: "syncId" });
    }
    if (!db.objectStoreNames.contains("eventCache")) {
      db.createObjectStore("eventCache");
    }
    if (!db.objectStoreNames.contains("agentCache")) {
      db.createObjectStore("agentCache");
    }
  },
});

export const localDB = {
  // Scans Offline
  async getScans(): Promise<OfflineEntry[]> {
    const db = await dbPromise;
    return db.getAll("scans");
  },

  async addScan(entry: OfflineEntry): Promise<void> {
    const db = await dbPromise;
    await db.put("scans", entry);
  },

  async removeScan(syncId: string): Promise<void> {
    const db = await dbPromise;
    await db.delete("scans", syncId);
  },

  async clearScans(): Promise<void> {
    const db = await dbPromise;
    await db.clear("scans");
  },

  // Cache Event
  async cacheEvent(eventId: string, data: CachedEvent): Promise<void> {
    const db = await dbPromise;
    await db.put("eventCache", data, eventId);
  },

  async getCachedEvent(eventId: string): Promise<CachedEvent | undefined> {
    const db = await dbPromise;
    return db.get("eventCache", eventId);
  },

  // Cache Agent
  async cacheAgent(agentId: string, data: CachedAgent): Promise<void> {
    const db = await dbPromise;
    await db.put("agentCache", data, agentId);
  },

  async getCachedAgent(agentId: string): Promise<CachedAgent | undefined> {
    const db = await dbPromise;
    return db.get("agentCache", agentId);
  },
};
