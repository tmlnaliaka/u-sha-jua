import React from 'react';
import { Incident } from '../types';

interface StatCardsProps {
  incidents: Incident[];
}

export const StatCards: React.FC<StatCardsProps> = ({ incidents }) => {
  const active = incidents.filter((incident) => incident.status !== 'Resolved');
  const metrics = [
    { label: 'Critical', value: active.filter((incident) => incident.urgency_level === 'Critical').length, tone: 'critical' },
    { label: 'Awaiting dispatch', value: incidents.filter((incident) => incident.status === 'Pending').length, tone: 'pending' },
    { label: 'Units responding', value: incidents.filter((incident) => incident.status === 'Dispatched').length, tone: 'responding' },
    { label: 'Flood reports', value: incidents.filter((incident) => incident.incident_type === 'Flood').length, tone: 'flood' },
    { label: 'Fire reports', value: incidents.filter((incident) => incident.incident_type === 'Fire').length, tone: 'pending' },
    { label: 'Resolved', value: incidents.filter((incident) => incident.status === 'Resolved').length, tone: 'resolved' },
  ];

  return (
    <section className="overview-strip" aria-label="Incident summary">
      <div className="overview-heading">
        <h2>Response overview</h2>
        <span>{incidents.length} {incidents.length === 1 ? 'report' : 'reports'} on record</span>
      </div>
      <dl className="overview-metrics">
        {metrics.map(({ label, value, tone }) => (
          <div className={`overview-metric tone-${tone}`} key={label}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
