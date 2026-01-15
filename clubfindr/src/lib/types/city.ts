export interface City {
	name: string;
	region: string;
	boundaries: {
		north: number;
		south: number;
		east: number;
		west: number;
	};
	origin: {
		lat: number;
		lng: number;
	};
}

export interface CitiesData {
	cities: City[];
}
