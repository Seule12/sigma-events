// SIGMA Alert — Logique métier
// Création d'alertes, routage par criticité, transitions de statut, notifications.

import { prisma } from "@/lib/prisma";
import { AlertLevel, AlertStatus, AlertSource } from "@/app/generated/prisma/enums";
import { publishLiveNotification, publishAlertEvent } from "@/lib/ably";

// ============ CRÉATION D'ALERTE ============

export type CreateAlertInput = {
  categoryId: string;
  level: AlertLevel;
  source: AlertSource;
  content: string;
  location?: string;
  userId?: string;
  eventId?: string;
};

export async function createAlert(input: CreateAlertInput) {
  const alert = await prisma.alert.create({
    data: {
      categoryId: input.categoryId,
      level: input.level,
      source: input.source,
      content: input.content,
      location: input.location ?? null,
      userId: input.userId ?? null,
      eventId: input.eventId ?? null,
    },
    include: { category: true, user: { select: { id: true, name: true } } },
  });

  // Notification temps réel via Ably — canal global "alerts" (Command Center)
  void publishAlertEvent(alert.id, alert.level, alert.category.name);

  // Notification perso à l'admin (niveau CRITICAL)
  if (input.level === AlertLevel.CRITICAL) {
    void publishLiveNotification("admin", {
      kind: "alert",
      title: `ALERTE CRITIQUE — ${alert.category.name}`,
      desc: alert.content,
      href: "/alerts",
    });
  }

  return alert;
}

// ============ TRANSITIONS DE STATUT ============

/**
 * Accuser réception d'une alerte (un admin dit "Je m'en occupe").
 * Transition : OPEN → ACKNOWLEDGED
 */
export async function acknowledgeAlert(alertId: string, userId: string, action: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.status !== AlertStatus.OPEN) return null;

  return prisma.$transaction([
    prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.ACKNOWLEDGED },
    }),
    prisma.alertResponse.create({
      data: { alertId, userId, action },
    }),
  ]);
}

/**
 * Marquer une alerte comme résolue.
 * Transition : ACKNOWLEDGED → RESOLVED
 */
export async function resolveAlert(alertId: string, userId: string, action: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.status !== AlertStatus.ACKNOWLEDGED) return null;

  return prisma.$transaction([
    prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.RESOLVED },
    }),
    prisma.alertResponse.create({
      data: { alertId, userId, action },
    }),
  ]);
}

/**
 * Clôturer une alerte (definitif).
 * Transition : RESOLVED → CLOSED
 */
export async function closeAlert(alertId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.status !== AlertStatus.RESOLVED) return null;

  return prisma.alert.update({
    where: { id: alertId },
    data: { status: AlertStatus.CLOSED },
  });
}

// ============ REQUÊTES ============

export type AlertFilters = {
  eventId?: string;
  level?: AlertLevel;
  status?: AlertStatus;
  limit?: number;
};

export async function listAlerts(filters: AlertFilters) {
  const where: Record<string, unknown> = {};
  if (filters.eventId) where.eventId = filters.eventId;
  if (filters.level) where.level = filters.level;
  if (filters.status) where.status = filters.status;

  return prisma.alert.findMany({
    where,
    include: {
      category: true,
      user: { select: { id: true, name: true } },
      event: { select: { id: true, name: true } },
      responses: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 50,
  });
}

// ============ STATS ============

export async function alertStats(eventId?: string) {
  const where = eventId ? { eventId } : {};

  const [total, open, acknowledged, resolved, critical] = await Promise.all([
    prisma.alert.count({ where }),
    prisma.alert.count({ where: { ...where, status: AlertStatus.OPEN } }),
    prisma.alert.count({ where: { ...where, status: AlertStatus.ACKNOWLEDGED } }),
    prisma.alert.count({ where: { ...where, status: AlertStatus.RESOLVED } }),
    prisma.alert.count({ where: { ...where, level: AlertLevel.CRITICAL, status: { not: AlertStatus.CLOSED } } }),
  ]);

  return { total, open, acknowledged, resolved, critical };
}

// ============ CATÉGORIES PAR DÉFAUT ============

export const DEFAULT_CATEGORIES = [
  { name: "Sécurité", icon: "shield", defaultLevel: AlertLevel.CRITICAL as AlertLevel },
  { name: "Médical", icon: "medical", defaultLevel: AlertLevel.CRITICAL as AlertLevel },
  { name: "Logistique", icon: "truck", defaultLevel: AlertLevel.WARNING as AlertLevel },
  { name: "Fraude", icon: "flag", defaultLevel: AlertLevel.WARNING as AlertLevel },
  { name: "Technique", icon: "tool", defaultLevel: AlertLevel.INFO as AlertLevel },
  { name: "Incident de foule", icon: "users", defaultLevel: AlertLevel.CRITICAL as AlertLevel },
];
