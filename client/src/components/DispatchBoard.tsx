import React, { useState } from 'react';
import { Incident, IncidentStatus, IncidentType } from '../types';
import { Search, Send, CheckCircle2, MapPin, Flame, Waves, Building2, Zap } from 'lucide-react';
import { api } from '../services/api';

interface DispatchBoardProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  onActionMessage: (message: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
  onActionMessage,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterUrgency, setFilterUrgency] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const filteredIncidents = incidents.filter((incident) => {
    const search = searchTerm.trim().toLocaleLowerCase();
    const matchesSearch = !search ||
      incident.raw_text.toLocaleLowerCase().includes(search) ||
      incident.location_name.toLocaleLowerCase().includes(search);
    return matchesSearch &&
      (filterType === 'ALL' || incident.incident_type === filterType) &&
      (filterUrgency === 'ALL' || incident.urgency_level === filterUrgency) &&
      (filterStatus === 'ALL' || incident.status === filterStatus);
  });

  const getTypeIcon = (type: IncidentType) => {
    switch (type) {
      case 'Flood':
        return <Waves size={15} aria-hidden="true" />;
      case 'Fire':
        return <Flame size={15} aria-hidden="true" />;
      case 'Collapse':
        return <Building2 size={15} aria-hidden="true" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? 'Time unavailable' : timeFormatter.format(date);
  };

  return (
    <section className="dispatch-board" aria-labelledby="dispatch-heading">
      <div className="dispatch-header">
        <div className="dispatch-title-row">
          <div>
            <h2 id="dispatch-heading">Incident ledger</h2>
            <p>{filteredIncidents.length} of {incidents.length} {incidents.length === 1 ? 'report' : 'reports'}</p>
          </div>
          <span className="ledger-mark" aria-hidden="true">FIELD LOG</span>
        </div>

        <label className="incident-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search reports and locations</span>
          <input
            type="search"
            name="incident-search"
            autoComplete="off"
            placeholder="Search reports or locations…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <div className="incident-filters" aria-label="Filter incidents">
          <label>
            <span className="sr-only">Filter by incident type</span>
            <select name="incident-type-filter" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
              <option value="ALL">All types</option>
              <option value="Flood">Flood</option>
              <option value="Fire">Fire</option>
              <option value="Collapse">Collapse</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by urgency</span>
            <select name="incident-urgency-filter" value={filterUrgency} onChange={(event) => setFilterUrgency(event.target.value)}>
              <option value="ALL">All urgency</option>
              <option value="Critical">Critical</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select name="incident-status-filter" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="ALL">All status</option>
              <option value="Pending">Pending</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Resolved">Resolved</option>
            </select>
          </label>
        </div>
      </div>

      <div className="incident-list" aria-live="polite">
        {filteredIncidents.length === 0 ? (
          <p className="incident-empty">
            {incidents.length === 0 ? 'No reports have come in yet.' : 'No reports match these filters.'}
          </p>
        ) : filteredIncidents.map((incident) => {
          const isSelected = selectedIncident?.id === incident.id;

          return (
            <article className={`incident-entry ${isSelected ? 'is-selected' : ''}`} key={incident.id}>
              <button className="incident-summary" type="button" onClick={() => onSelectIncident(incident)} aria-pressed={isSelected}>
                <span className={`incident-type type-${incident.incident_type.toLocaleLowerCase()}`}>
                  {getTypeIcon(incident.incident_type)}
                  {incident.incident_type}
                </span>
                <span className="incident-time">{formatTime(incident.timestamp)}</span>
                <span className={`urgency-label urgency-${incident.urgency_level.toLocaleLowerCase()}`}>{incident.urgency_level}</span>
                <span className="incident-location">
                  <MapPin size={14} aria-hidden="true" />
                  <strong>{incident.location_name}</strong>
                </span>
                <span className="incident-description">{incident.raw_text}</span>
              </button>

              <div className="incident-actions">
                <span className={`status-label status-${incident.status.toLocaleLowerCase()}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {incident.status}
                </span>
                {incident.status === 'Pending' && (
                  <div className="action-group">
                    <button
                      type="button"
                      className="inline-action secondary-action"
                      onClick={async () => {
                        try {
                          const result = await api.autoDispatchResponder(incident.id);
                          onActionMessage(`Assigned ${result.callsign}.`);
                        } catch (error) {
                          console.error('Auto-dispatch failed', error);
                          onActionMessage('Could not dispatch a unit. Check the connection and try again.');
                        }
                      }}
                    >
                      <Zap size={13} aria-hidden="true" />
                      Recommend & assign
                    </button>
                    <button type="button" className="inline-action primary-action" onClick={() => onUpdateStatus(incident.id, 'Dispatched')}>
                      <Send size={13} aria-hidden="true" />
                      Dispatch
                    </button>
                  </div>
                )}
                {incident.status === 'Dispatched' && (
                  <button type="button" className="inline-action resolve-action" onClick={() => onUpdateStatus(incident.id, 'Resolved')}>
                    <CheckCircle2 size={13} aria-hidden="true" />
                    Resolve
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
