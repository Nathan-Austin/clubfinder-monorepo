export interface EventDetails {
	id: string;
	theme_name: string;
	description: string;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	recurring: boolean;
	recurrence_pattern: string | null;
	special_genres: string[];
}
