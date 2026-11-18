export interface EventDetails {
	/** The row: one recurring series arrives once per date (KNOWN_ISSUES 90) */
	id: string;
	/** `<id>:<date>`, unique per occurrence — what lists key on */
	occurrence_id?: string;
	series_id?: string;
	theme_name: string;
	description: string;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	recurring: boolean;
	recurrence_pattern: string | null;
	special_genres: string[];
}
