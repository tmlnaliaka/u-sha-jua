import React from 'react';
import { ResponderUnit, Incident } from '../types';
import { Truck, Navigation, CheckCircle2, Clock } from 'lucide-react';

interface ResponderFleetProps {
  responders: ResponderUnit[];
  selectedIncident: Incident | null;
  onDispatch: (responderId: string, incidentId: string) => void;
  onUpdateStatus: (responderId: string, status: string) => void;
}

export const ResponderFleet: React.FC<ResponderFleetProps> = ({
  responders,
  selectedIncident,
  onDispatch,
  onUpdateStatus,
}) => {
  const availableCount = responders.filter((responder) => responder.status === 'Available').length;

  return (
    <section className="responder-fleet" aria-labelledby="fleet-heading">
      <div className="fleet-heading">
        <div className="fleet-title">
          <Truck size={17} aria-hidden="true" />
          <h2 id="fleet-heading">Responder units</h2>
          <span>{availableCount} available / {responders.length} total</span>
        </div>
        {selectedIncident && (
          <p className="fleet-target">
            Assigning to <strong>{selectedIncident.location_name}</strong>
          </p>
        )}
      </div>

      {responders.length === 0 ? (
        <p className="fleet-empty">Responder availability will appear here.</p>
      ) : (
        <div className="fleet-list">
          {responders.map((unit) => {
            const isAvailable = unit.status === 'Available';
            const isDispatched = unit.status === 'Dispatched';

            return (
              <article className={`fleet-unit ${isDispatched ? 'unit-dispatched' : ''}`} key={unit.id}>
                <div className="unit-details">
                  <div className="unit-name-row">
                    <h3 title={unit.callsign}>{unit.callsign}</h3>
                    <span className={`unit-status ${isAvailable ? 'available' : isDispatched ? 'dispatched' : ''}`}>
                      {unit.status}
                    </span>
                  </div>
                  <p className="unit-station" title={unit.base_station}>{unit.base_station.split(',')[0]}</p>
                  {unit.distance_km !== undefined && (
                    <p className="unit-distance">
                      <span>{unit.distance_km} km away</span>
                      <span><Clock size={12} aria-hidden="true" /> {unit.eta_minutes} min</span>
                    </p>
                  )}
                </div>

                <div className="unit-action">
                  {selectedIncident && isAvailable ? (
                    <button type="button" onClick={() => onDispatch(unit.id, selectedIncident.id)}>
                      <Navigation size={13} aria-hidden="true" />
                      Assign
                    </button>
                  ) : isDispatched ? (
                    <button type="button" onClick={() => onUpdateStatus(unit.id, 'OnScene')}>
                      <CheckCircle2 size={13} aria-hidden="true" />
                      On scene
                    </button>
                  ) : unit.status === 'OnScene' ? (
                    <button type="button" onClick={() => onUpdateStatus(unit.id, 'Available')}>
                      <CheckCircle2 size={13} aria-hidden="true" />
                      Release
                    </button>
                  ) : (
                    <span>Standby</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
