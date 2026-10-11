import React from 'react';
import { Incident } from '../types';

interface StatCardsProps {
  incidents: Incident[];
}

export const StatCards: React.FC<StatCardsProps> = ({ incidents }) => {
  const metrics = [
    {
      label: 'Critical open',
      value: incidents.filter((incident) => incident.urgency_level === 'Critical' && incident.status !== 'Resolved').length,
      detail: 'Reports needing urgent review',
      tone: 'text-rose-800',
    },
    {
      label: 'Awaiting dispatch',
      value: incidents.filter((incident) => incident.status === 'Pending').length,
      detail: 'Pending response assignment',
      tone: 'text-amber-900',
    },
    {
      label: 'Responding',
      value: incidents.filter((incident) => incident.status === 'Dispatched').length,
      detail: 'Currently dispatched',
      tone: 'text-sky-900',
    },
    {
      label: 'Dispatcher confirmed',
      value: incidents.filter((incident) => incident.verification_status === 'Confirmed' && incident.status !== 'Resolved').length,
      detail: 'Active confirmed reports',
      tone: 'text-emerald-900',
    },
  ];

  return (
    <section aria-label="Incident summary" className="grid grid-cols-2 border-b border-slate-300 bg-white lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 border-b border-r border-slate-200 px-4 py-3 last:border-r-0 lg:border-b-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate text-xs font-semibold text-slate-600">{metric.label}</h2>
            <span className={`text-xl font-bold tabular-nums ${metric.tone}`}>{metric.value}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{metric.detail}</p>
        </div>
      ))}
    </section>
  );
};
