/**
 * The venue's upcoming events for a venue tab, loaded each time the tab is shown: tab screens stay
 * mounted, and the list changes on Create/Edit Event and on the other tab. Used by Overview (the
 * next event) and Events (the list).
 *
 * A failed load is an error to show with "Try again", not an empty list: the dashboard used to
 * answer any failure with "No Events Created Yet".
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { listVenueEvents, type VenueEvent } from '../services/venueEventsService';
import { log } from '../utils/logger';

export type VenueEventsState = {
    events: VenueEvent[];
    /** The first load; later reloads keep the list on screen */
    loading: boolean;
    failed: boolean;
    reload: () => Promise<void>;
    /** Takes an event off the list at once, before the reload confirms it */
    drop: (eventId: string) => void;
};

export function useVenueEvents(barId: string | null): VenueEventsState {
    const [events, setEvents] = useState<VenueEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const reload = useCallback(async () => {
        if (!barId) {
            setFailed(true);
            setLoading(false);
            return;
        }
        try {
            setEvents(await listVenueEvents(barId));
            setFailed(false);
        } catch (error) {
            log.warn('Could not load the venue events:', error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [barId]);

    useFocusEffect(
        useCallback(() => {
            reload();
        }, [reload])
    );

    const drop = useCallback((eventId: string) => {
        setEvents((current) => current.filter((event) => event.id !== eventId));
    }, []);

    return { events, loading, failed, reload, drop };
}
