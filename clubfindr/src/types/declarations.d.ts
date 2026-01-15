// Facebook SDK types
interface FacebookLoginStatus {
	status: 'connected' | 'not_authorized' | 'unknown';
	authResponse: {
		accessToken: string;
		expiresIn: string;
		signedRequest: string;
		userID: string;
	};
}

interface FacebookSDK {
	init(params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
	getLoginStatus(callback: (response: FacebookLoginStatus) => void): void;
	AppEvents: {
		logPageView(): void;
	};
}

// Google Maps types
interface LatLng {
	lat: number;
	lng: number;
}

interface LatLngBounds {
	north: number;
	south: number;
	east: number;
	west: number;
}

interface AddressComponent {
	long_name: string;
	short_name: string;
	types: string[];
}

interface PlaceResult {
	place_id: string;
	name: string;
	formatted_address: string;
	address_components: AddressComponent[];
}

interface PlaceAutocompleteRequest {
	input: string;
	location: google.maps.LatLng;
	bounds: google.maps.LatLngBounds;
	types: string[];
	language: string;
	region: string;
	sessionToken: google.maps.places.AutocompleteSessionToken;
}

interface PlacesService {
	findPlaceFromQuery(
		request: { query: string; fields: string[] },
		callback: (results: Array<{ place_id: string }>, status: string) => void
	): void;
	getDetails(
		request: { placeId: string; fields: string[] },
		callback: (place: PlaceResult, status: string) => void
	): void;
}

interface GoogleMapsLibrary {
	LatLng: new (lat: number, lng: number) => LatLng;
	LatLngBounds: new (sw: LatLng, ne: LatLng) => LatLngBounds;
	places: {
		AutocompleteService: new () => {
			getPlacePredictions(
				request: PlaceAutocompleteRequest,
				callback: (predictions: Array<{ description: string }>, status: string) => void
			): void;
		};
		AutocompleteSessionToken: new () => unknown;
		PlacesService: new (attributionNode: HTMLElement) => PlacesService;
		PlacesServiceStatus: {
			OK: string;
		};
	};
	importLibrary(library: string): Promise<unknown>;
}

declare global {
	interface Window {
		FB: FacebookSDK;
		fbAsyncInit: () => void;
		handleGoogleSignIn: (response: { credential: string }) => void;
		handleFacebookSignIn: () => void;
		google: {
			accounts: {
				id: {
					initialize(params: {
						client_id: string;
						callback: (response: { credential: string }) => void;
					}): void;
					prompt(): void;
				};
			};
			maps: GoogleMapsLibrary;
		};
	}

	const FB: FacebookSDK;
	const google: Window['google'];
}

export {};
