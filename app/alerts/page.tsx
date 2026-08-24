"use client";

import { useState, useEffect } from "react";
import { AlertLevel, AlertStatus } from "@/app/generated/prisma/enums";
import AdminNav from "@/components/admin-nav";

type AlertItem = {
  id: string;
  level: AlertLevel;
  status: AlertStatus;
  source: string;
  content: string;
  location: string | null;
  createdAt: string;
  category: { name: string; icon: string | null };
  user: { name: string } | null;
  event: { name: string } | null;
  responses: Array<{
    action: string;
    createdAt: string;
    user: { name: string } | null;
  }>;
};

type Stats = {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  critical: number;
};

const LEVEL_COLORS: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  WARNING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-500",
  ACKNOWLEDGED: "bg-amber-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Ouverte",
  ACKNOWLEDGED: "Accusée",
  RESOLVED: "Résolue",
  CLOSED: "Clôturée",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, acknowledged: 0, resolved: 0, critical: 0 });
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    const params = new URLSearchParams();
    if (filterLevel) params.set("level", filterLevel);
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/alerts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAlerts(data.alerts);
      setStats(data.stats);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10_000); // polling 10s
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLevel, filterStatus]);

  const handleAction = async (alertId: string, action: string, note?: string) => {
    await fetch(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    fetchAlerts();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900">
      <AdminNav active="/alerts" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Command Center — Alertes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Surveillance en temps réel des incidents
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Total", value: stats.total, color: "text-slate-900 dark:text-white" },
            { label: "Ouvertes", value: stats.open, color: "text-red-600 dark:text-red-400" },
            { label: "Accusées", value: stats.acknowledged, color: "text-amber-600 dark:text-amber-400" },
            { label: "Résolues", value: stats.resolved, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Critiques", value: stats.critical, color: "text-red-700 dark:text-red-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-white p-4 shadow dark:bg-slate-800">
              <p className="text-xs font-semibold text-slate-400">{s.label}</p>
              <p className={`mt-1 text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="mb-6 flex flex-wrap gap-2">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Tous les niveaux</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Tous les statuts</option>
            <option value="OPEN">Ouverte</option>
            <option value="ACKNOWLEDGED">Accusée</option>
            <option value="RESOLVED">Résolue</option>
            <option value="CLOSED">Clôturée</option>
          </select>
        </div>

        {/* Liste des alertes */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow dark:bg-slate-800">
            <p className="text-lg font-bold text-slate-400">Aucune alerte</p>
            <p className="mt-1 text-sm text-slate-500">Tout est calme pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-2xl bg-white p-5 shadow transition hover:shadow-md dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status dot */}
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[alert.status]}`} />
                      {/* Level badge */}
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LEVEL_COLORS[alert.level]}`}>
                        {alert.level}
                      </span>
                      {/* Category */}
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {alert.category.name}
                      </span>
                      {/* Status label */}
                      <span className="text-xs text-slate-400">
                        · {STATUS_LABELS[alert.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {alert.content}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {alert.user && <span>Par {alert.user.name}</span>}
                      {alert.event && <span>Événement : {alert.event.name}</span>}
                      {alert.location && <span>Lieu : {alert.location}</span>}
                      <span>{new Date(alert.createdAt).toLocaleString("fr-FR")}</span>
                    </div>

                    {/* Réponses */}
                    {alert.responses.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
                        {alert.responses.map((r, i) => (
                          <p key={i} className="text-xs text-slate-500">
                            <span className="font-bold">{r.user?.name ?? "Système"}</span>{" "}
                            {r.action} · {new Date(r.createdAt).toLocaleTimeString("fr-FR")}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-2">
                    {alert.status === "OPEN" && (
                      <button
                        onClick={() => handleAction(alert.id, "acknowledge")}
                        className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600"
                      >
                        Je m&apos;en occupe
                      </button>
                    )}
                    {alert.status === "ACKNOWLEDGED" && (
                      <button
                        onClick={() => handleAction(alert.id, "resolve")}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
                      >
                        Résolu
                      </button>
                    )}
                    {alert.status === "RESOLVED" && (
                      <button
                        onClick={() => handleAction(alert.id, "close")}
                        className="rounded-xl bg-slate-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-600"
                      >
                        Clôturer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
