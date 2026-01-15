<script lang="ts">
	// Import necessary modules and types
	import { Loader } from '@googlemaps/js-api-loader';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { DatePicker } from 'date-picker-svelte';
	import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
	import { goto } from '$app/navigation';
	import { writable } from 'svelte/store';
	import { getDistance } from 'geolib';
	import { cookieManager } from '$lib/cookieManager';

	const redirectUri = encodeURIComponent(
		import.meta.env.VITE_SPOTIFY_REDIRECT_USER_URI || 'https://www.clubfindr.com/spotify/login'
	);

	// Declare the Google Maps API
	let geocoder: google.maps.Geocoder;

	// Initialize variables
	let city1 = writable('');
	let closestCity = '';
	let cities = [];
	let userDeniedLocation = false;
	let location: Position | null = null;
	let address = '';
	let isCitySelectionInvalid = false;
	let unifiedGenres = null; // Define this variable
	let genresLoaded = false;
	let locationLoaded = false;
	///////////////////// SPOTIFY LOGIN //////////////////////
	// Define constants for client ID and data
	const clientId = PUBLIC_SPOTIFY_CLIENT_ID;
	export let data: PageData;
	let loggedIn = data.hasAccessToken;
	let userClientId = clientId;
	// Check if user is logged in via cookie
	let isUserLoggedIn = false;

	function getCookie(name) {
		const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
		return match ? decodeURIComponent(match[2]) : null;
	}

	///////////////////// DATE PICKER ///////////////////////
	let formattedDate: Date = new Date();

	function handleDateChange(event: CustomEvent) {
		const date = event.detail;
		formattedDate = new Date(date);
		formattedDate.setHours(0, 0, 0, 0);
	}

	////////////////// Location //////////////////////////////////
	interface Position {
		coords: {
			latitude: number;
			longitude: number;
		};
	}

	async function getAddress(coordinates: {
		latitude: number;
		longitude: number;
	}): Promise<google.maps.GeocoderResult | null> {
		try {
			const result = await new Promise<google.maps.GeocoderResult | null>((resolve, reject) => {
				geocoder.geocode(
					{ location: { lat: coordinates.latitude, lng: coordinates.longitude } },
					(results, status) => {
						if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
							resolve(results[0]);
						} else {
							reject(new Error(status.toString()));
						}
					}
				);
			});
			return result;
		} catch (error) {
			console.error(error);
			return null;
		}
	}

	// Function to fetch cities.json from the static folder
	async function fetchCities() {
		try {
			const response = await fetch('/lib/cities.json'); // Ensure this path is correct
			if (response.ok) {
				const data = await response.json();
				cities = data.cities; // Assign the cities array
				console.log('Cities loaded:', cities); // Debugging log
			} else {
				console.error('Failed to load cities.json');
				cities = []; // Fallback to an empty array
			}
		} catch (error) {
			console.error('Error fetching cities.json:', error);
			cities = []; // Fallback to an empty array
		}
	}

	async function updateLocation(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(
				async (position: Position) => {
					location = {
						coords: {
							latitude: position.coords.latitude,
							longitude: position.coords.longitude
						}
					};
					const addressResult = await getAddress(location.coords);
					if (addressResult) {
						address = addressResult.formatted_address;
					} else {
						address = 'Not available';
					}
					resolve();
				},
				(error) => {
					console.log(
						`Geolocation error (${error.code}): ${error.message}, setting userDeniedLocation to true.`
					);
					userDeniedLocation = true;
					reject(error); // User denied geolocation
				}
			);
		});
	}

	async function findClosestCity(userCoords: { latitude: number; longitude: number }) {
		const response = await fetch('/lib/cities.json');
		const data = await response.json();
		cities = data.cities;

		let minDistance = Infinity;

		data.cities.forEach((city) => {
			const distance = getDistance(
				{ latitude: userCoords.latitude, longitude: userCoords.longitude },
				{ latitude: city.latitude, longitude: city.longitude }
			);

			if (distance < minDistance) {
				minDistance = distance;
				closestCity = city.name;
			}
		});

		if (closestCity) {
			city1.set(closestCity);
			console.log(`Closest city is: ${closestCity}`);
			document.cookie = `closestCity=${closestCity}; path=/`; // Set cookie with the closest city
		}
	}

	onMount(async () => {
		try {
			console.log('onMount started');
			// Check for user login cookie
			isUserLoggedIn = document.cookie
				.split(';')
				.some((item) => item.trim().startsWith('isLoggedIn=true'));

			// Get userClientId from cookie if available
			if (isUserLoggedIn) {
				const clientIdFromCookie = getCookie('userClientId');
				if (clientIdFromCookie) {
					userClientId = clientIdFromCookie;
					console.log('Using client ID from cookie:', userClientId);
				} else {
					console.log('No userClientId cookie found, using default PUBLIC_SPOTIFY_CLIENT_ID');
				}
			}

			// Start loading genres and location in parallel
			const genresPromise = loadGenres();
			const locationPromise = loadLocation();

			// Wait for both to complete
			await Promise.all([genresPromise, locationPromise]);

			console.log(
				'onMount completed - genres loaded:',
				genresLoaded,
				'location loaded:',
				locationLoaded
			);
		} catch (error) {
			console.error('Fatal error in onMount:', error);
			userDeniedLocation = true; // Fallback if any error occurs
		}
	});

	// Function to load the genres
	async function loadGenres() {
		try {
			console.log('Starting to load genres');

			// Try multiple paths in case the file location isn't what you expect
			const possiblePaths = [
				'/lib/unified-genres.json',
				'./lib/unified-genres.json',
				'../lib/unified-genres.json',
				'/unified-genres.json'
			];

			let unifiedGenresResponse = null;

			// Try each path until we find the file
			for (const path of possiblePaths) {
				console.log(`Trying to fetch genres from: ${path}`);
				try {
					const response = await fetch(path);
					if (response.ok) {
						unifiedGenresResponse = response;
						console.log(`Successfully found genres at: ${path}`);
						break;
					}
				} catch (e) {
					console.log(`Failed to fetch from ${path}: ${e.message}`);
				}
			}

			// If we couldn't find the file with any path, try loading the old genres.json as fallback
			if (!unifiedGenresResponse) {
				console.log('Falling back to old genres.json format');
				const oldGenresResponse = await fetch('/lib/genres.json');
				if (oldGenresResponse.ok) {
					genres = await oldGenresResponse.json();
					console.log('Loaded old genres format:', Object.keys(genres));
					genresLoaded = true;
					return;
				} else {
					throw new Error('Could not load genres from any known location');
				}
			}

			// Process the unified genres
			unifiedGenres = await unifiedGenresResponse.json();
			console.log(
				'Unified genres loaded successfully:',
				unifiedGenres.categories.length,
				'categories'
			);

			// Generate flattened genres object for the UI
			genres = {};
			unifiedGenres.categories.forEach((category) => {
				genres[category.name] = {
					subgenres: category.subgenres.map((subgenre) => {
						// Create basic subgenre object
						const subgenreObj = {
							name: subgenre.name,
							genres: subgenre.genres || []
						};

						// Process subsubgenres if they exist
						if (subgenre.subsubgenres && Array.isArray(subgenre.subsubgenres)) {
							subgenreObj.subsubgenres = subgenre.subsubgenres.map((subsubgroup) => {
								// Each subsubgenre is actually a group that contains specific genres
								return {
									name: subsubgroup.name,
									genres: subsubgroup.genres || []
								};
							});
						}

						return subgenreObj;
					})
				};
			});

			// Debug output
			console.log('Processed genres structure:');
			Object.keys(genres).forEach((category) => {
				console.log(`Category: ${category}`);
				genres[category].subgenres.forEach((subgenre) => {
					console.log(`  Subgenre: ${subgenre.name}`);
					console.log(`    Generic genres: ${subgenre.genres.join(', ')}`);

					if (subgenre.subsubgenres) {
						console.log(`    Has ${subgenre.subsubgenres.length} subsubgenre groups:`);
						subgenre.subsubgenres.forEach((group) => {
							console.log(`      Group: ${group.name}`);
							console.log(`        Specific genres: ${group.genres.slice(0, 5).join(', ')}...`);
						});
					}
				});
			});

			genresLoaded = true;
		} catch (error) {
			console.error('Error loading genres:', error);
			console.error('Error stack:', error.stack);
			genres = {};
			genresLoaded = false;
		}
	}

	// Function to load location data
	async function loadLocation() {
		try {
			console.log('Starting to load location');

			// First make sure we have the cities data
			await fetchCities();
			console.log('Cities loaded:', cities.length);

			// Initialize Google Maps Geocoding API
			const loader = new Loader({
				apiKey: import.meta.env.VITE_MAPS_API_KEY,
				version: 'weekly',
				libraries: ['places']
			});

			console.log('Loading Google Maps...');
			const geocodingLibrary = await loader.importLibrary('geocoding');
			console.log('Google Maps loaded');

			geocoder = new geocodingLibrary.Geocoder();

			try {
				console.log('Requesting user location...');
				await updateLocation(); // Try to get user's location

				if (location) {
					console.log('User location received:', location.coords);

					// Extract city from the address
					if (address) {
						const city = await extractCity(address);
						if (city) {
							city1.set(city);
							console.log(`City from extractCity: ${city}`);
						} else {
							console.log('No city extracted from address');
						}
					} else {
						console.log('Address is not available yet');
					}

					// Find the closest city based on geolocation
					await findClosestCity(location.coords);

					locationLoaded = true;
				} else {
					console.log('User location is null');
					userDeniedLocation = true;
				}
			} catch (locationError) {
				console.error('Location retrieval failed:', locationError);
				userDeniedLocation = true;
			}
		} catch (error) {
			console.error('Error in location loading:', error);
			userDeniedLocation = true;
		}
	}

	async function extractCity(address: string): Promise<string | null> {
		const addressParts = address.split(',');

		if (addressParts.length >= 3) {
			const potentialCityPart = addressParts[addressParts.length - 2].trim();

			const postalCodePattern =
				/\b\d{5}(?:[-\s]\d{4})?\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i;

			const cityParts = potentialCityPart.split(/\s+/);

			const firstPart = cityParts[0];
			if (postalCodePattern.test(firstPart)) {
				const city = cityParts.slice(1).join(' ').trim();
				if (city) {
					console.log(`City extracted: ${city}`);
					return city;
				}
			}

			const lastPart = cityParts[cityParts.length - 1];
			if (postalCodePattern.test(lastPart)) {
				const city = cityParts.slice(0, -1).join(' ').trim();
				if (city) {
					console.log(`City extracted: ${city}`);
					return city;
				}
			}

			console.log(`City extracted (no postal code): ${potentialCityPart}`);
			return potentialCityPart;
		}

		console.warn('No city found in the address');
		return null;
	}

	function handleCitySelection(event) {
		const selectedCity = event.target.value;
		if (selectedCity) {
			city1.set(selectedCity);
			isCitySelectionInvalid = false;
			//document.cookie = `closestCity=${selectedCity}; path=/`; // Set cookie with the selected city
			console.log(`User selected city: ${selectedCity}`);
		}
	}
	///////////////////////// User selects Genres ////////////////////////
	//////////////////////////////////////////////////////////////////////
	let selectedCategory: string | null = null;
	let selectedSubgenre: string | null = null;
	let selectedSubSubgenre: string | null = null;
	let showDropdown = false;
	let UserSelectedGenres: string[] = [];
	let selectedGenres: string;
	let genreSearchQuery = '';
	let genres: Record<string, string[]> = {};

	// Computed property to update selected genres string
	$: {
		selectedGenres = UserSelectedGenres.join(',');
		console.log(`Updated selectedGenres: ${selectedGenres}`);
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
	}
	interface Subsubgenre {
		name: string;
		// Other properties, if any
	}

	interface Subgenre {
		name: string;
		subsubgenres?: Subsubgenre[];
		// Other properties, if any
	}

	// Update the UI selection handlers to work with the unified structure
	function handleCategoryClick(category) {
		selectedCategory = category;
		selectedSubgenre = null;
		selectedSubSubgenre = null;
		updateHighlighting();
	}

	function handleSubgenreClick(subgenre) {
		const subgenreName = typeof subgenre === 'object' ? subgenre.name : subgenre;

		// Find the subgenre data
		const subgenreData = genres[selectedCategory].subgenres.find(
			(sub) => sub.name === subgenreName
		);

		const hasSubSubgenres =
			subgenreData && subgenreData.subsubgenres && subgenreData.subsubgenres.length > 0;

		if (hasSubSubgenres) {
			// If it has subsubgenre groups, navigate to them
			selectedSubgenre = subgenreName;
			selectedSubSubgenre = null;
			console.log(`Navigating to subsubgenre groups of ${subgenreName}`);
		} else {
			// If no subsubgenres, toggle selection of the subgenre itself
			const isSelected = UserSelectedGenres.includes(subgenreName);

			if (isSelected) {
				UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== subgenreName);
			} else {
				UserSelectedGenres = [...UserSelectedGenres, subgenreName];
			}
		}

		updateHighlighting();
	}

	function handleSubSubgenreGroupClick(subsubgenreGroup) {
		const groupName =
			typeof subsubgenreGroup === 'object' ? subsubgenreGroup.name : subsubgenreGroup;

		// Find the group data
		const groupData = genres[selectedCategory].subgenres
			.find((sub) => sub.name === selectedSubgenre)
			.subsubgenres.find((group) => group.name === groupName);

		// If the group has specific genres, navigate to them
		if (groupData && groupData.genres && groupData.genres.length > 0) {
			selectedSubSubgenre = groupName;
			console.log(`Navigating to specific genres of ${groupName}`);
		} else {
			// If no specific genres, toggle selection of the group itself
			const isSelected = UserSelectedGenres.includes(groupName);

			if (isSelected) {
				UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== groupName);
			} else {
				UserSelectedGenres = [...UserSelectedGenres, groupName];
			}
		}

		updateHighlighting();
	}

	function handleSubSubgenreClick(subSubgenre) {
		const subSubgenreName = typeof subSubgenre === 'object' ? subSubgenre.name : subSubgenre;
		const isSelected = UserSelectedGenres.includes(subSubgenreName);

		if (isSelected) {
			// Deselect sub-subgenre
			UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== subSubgenreName);
		} else {
			// Select sub-subgenre
			UserSelectedGenres = [...UserSelectedGenres, subSubgenreName];
		}

		updateHighlighting();
	}
	function handleSpecificGenreClick(specificGenre) {
		const isSelected = UserSelectedGenres.includes(specificGenre);

		if (isSelected) {
			UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== specificGenre);
		} else {
			UserSelectedGenres = [...UserSelectedGenres, specificGenre];
		}

		updateHighlighting();
	}
	function handleSelectAll(level) {
		if (level === 'subgenres' && selectedCategory) {
			// Get all subgenres for this category
			const subgenres = genres[selectedCategory].subgenres.map((sub) => sub.name);

			const allSelected = subgenres.every((subgenre) => UserSelectedGenres.includes(subgenre));

			if (allSelected) {
				// Deselect all subgenres
				UserSelectedGenres = UserSelectedGenres.filter((genre) => !subgenres.includes(genre));
				// Also remove the category
				UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== selectedCategory);
			} else {
				// Select all subgenres
				UserSelectedGenres = [...new Set([...UserSelectedGenres, ...subgenres])];
				// Also add the category
				if (!UserSelectedGenres.includes(selectedCategory)) {
					UserSelectedGenres = [...UserSelectedGenres, selectedCategory];
				}
			}
		} else if (level === 'subsubgenres' && selectedSubgenre) {
			// Get all subsubgenre groups for this subgenre
			const subgenreData = genres[selectedCategory].subgenres.find(
				(sub) => sub.name === selectedSubgenre
			);

			if (!subgenreData || !subgenreData.subsubgenres) return;

			const groups = subgenreData.subsubgenres.map((group) => group.name);

			const allSelected = groups.every((group) => UserSelectedGenres.includes(group));

			if (allSelected) {
				// Deselect all subsubgenre groups
				UserSelectedGenres = UserSelectedGenres.filter((genre) => !groups.includes(genre));
				// Also remove the subgenre
				UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== selectedSubgenre);
			} else {
				// Select all subsubgenre groups
				UserSelectedGenres = [...new Set([...UserSelectedGenres, ...groups])];
				// Also add the subgenre
				if (!UserSelectedGenres.includes(selectedSubgenre)) {
					UserSelectedGenres = [...UserSelectedGenres, selectedSubgenre];
				}
			}
		} else if (level === 'specificGenres' && selectedSubSubgenre) {
			// Get all specific genres for this subsubgenre group
			const groupData = genres[selectedCategory].subgenres
				.find((sub) => sub.name === selectedSubgenre)
				.subsubgenres.find((group) => group.name === selectedSubSubgenre);

			if (!groupData || !groupData.genres) return;

			const specificGenres = groupData.genres;

			const allSelected = specificGenres.every((genre) => UserSelectedGenres.includes(genre));

			if (allSelected) {
				// Deselect all specific genres
				UserSelectedGenres = UserSelectedGenres.filter((genre) => !specificGenres.includes(genre));
				// Also remove the group
				UserSelectedGenres = UserSelectedGenres.filter((genre) => genre !== selectedSubSubgenre);
			} else {
				// Select all specific genres
				UserSelectedGenres = [...new Set([...UserSelectedGenres, ...specificGenres])];
				// Also add the group
				if (!UserSelectedGenres.includes(selectedSubSubgenre)) {
					UserSelectedGenres = [...UserSelectedGenres, selectedSubSubgenre];
				}
			}
		}

		updateHighlighting();
	}

	function handleBack(level) {
		if (level === 'category') {
			selectedCategory = null;
			selectedSubgenre = null;
			selectedSubSubgenre = null;
		} else if (level === 'subgenre') {
			selectedSubgenre = null;
			selectedSubSubgenre = null;
		} else if (level === 'subsubgenre') {
			selectedSubSubgenre = null;
		}

		updateHighlighting();
	}

	function updateHighlighting() {
		// Update the category buttons
		document.querySelectorAll('.clickable-area button').forEach((button) => {
			const genreName = button.textContent.trim().split(' ➔')[0];
			if (UserSelectedGenres.includes(genreName)) {
				button.classList.add('selected');
			} else {
				button.classList.remove('selected');
			}
		});

		// Update the "Select All" button text
		const selectAllButton = document.querySelector('.select-all-button');
		if (selectAllButton) {
			const level = selectedSubSubgenre
				? 'subsubgenres'
				: selectedSubgenre
				? 'subgenres'
				: 'categories';
			const allSelected = checkAllSelected(level);
			selectAllButton.textContent = allSelected ? 'Deselect All' : 'Select All';
		}
	}

	function checkAllSelected(level: 'categories' | 'subgenres' | 'subsubgenres'): boolean {
		if (level === 'categories' && selectedCategory) {
			const subgenres = genres[selectedCategory].subgenres.map((subgenre: Subgenre) =>
				typeof subgenre === 'string' ? subgenre : subgenre.name
			);
			return subgenres.every((subgenre: string) => UserSelectedGenres.includes(subgenre));
		} else if (level === 'subgenres' && selectedSubgenre) {
			const subsubgenres =
				genres[selectedCategory].subgenres.find((s: Subgenre) => s.name === selectedSubgenre)
					?.subsubgenres || [];
			return subsubgenres.every((subsub: Subsubgenre) => UserSelectedGenres.includes(subsub.name));
		}
		return false;
	}

	function clearSelection() {
		// Clear all selected genres
		UserSelectedGenres = [];

		// Reset the selected category and subcategories
		selectedCategory = null;
		selectedSubgenre = null;
		selectedSubSubgenre = null;

		updateHighlighting();

		showDropdown = false;
	}

	interface FormDataWithEntries extends FormData {
		entries(): IterableIterator<[string, string | File]>;
	}

	async function handleGenresSearch(event: Event) {
		console.log(`Searching for ${selectedGenres}`);
		event.preventDefault();

		if (!selectedGenres || selectedGenres.length === 0) {
			alert('Please select some genres from the menu.'); // Simple alert popup
			console.log('No genres selected. Please select at least one genre.');
			return; // Prevent form submission if no genres are selected
		}
		let cityValue = '';
		const unsubscribe = city1.subscribe((value) => {
			cityValue = value;
			console.log('City value store for form:', cityValue);
		});
		unsubscribe();
		if (!cityValue) {
			isCitySelectionInvalid = true; // Mark as invalid if no city is selected
			const citySelect = document.getElementById('city-select');
			citySelect.scrollIntoView({ behavior: 'smooth' }); // Scroll to the city select element
			citySelect.classList.add('flash'); // Add flashing effect to the select box
			console.log('City not selected. Please select a city.');
			return; // Prevent form submission
		} else {
			isCitySelectionInvalid = false;
			const formElement = document.getElementById('genres') as HTMLFormElement;
			if (!formElement) {
				console.error('Form element not found');
				return;
			}

			const formData = new FormData(formElement) as FormDataWithEntries;
			formData.set('selectedGenre', selectedGenres ?? '');

			if (!formData.has('city')) {
				formData.append('city', cityValue ?? '');
			}

			const requiredFields = ['formattedDate', 'city', 'selectedGenre'];
			for (const field of requiredFields) {
				if (!formData.has(field)) {
					console.error(`${field} field is missing in the form data.`);
					return;
				}
			}

			const formDataObj = Object.fromEntries(formData.entries());
			const formDataJson = JSON.stringify(formDataObj);
			const stateKey = Date.now().toString();

			try {
				const response = await fetch('/storestate', {
					method: 'POST',
					body: JSON.stringify({ key: stateKey, state: formDataJson }),
					headers: {
						'Content-Type': 'application/json'
					},
					credentials: 'include'
				});

				if (response.ok) {
					console.log('State stored successfully!');
					goto('/clubs');
				} else {
					console.error('Error storing state:', response.statusText);
				}
			} catch (error) {
				console.error('Error storing state:', error);
			}
		}
	}

	async function handleGenresSearchbar(event: Event) {
		console.log(`Searching for ${selectedGenres}`);
		event.preventDefault();

		if (!selectedGenres || selectedGenres.length === 0) {
			alert('Please select some genres from the menu.'); // Simple alert popup
			console.log('No genres selected. Please select at least one genre.');
			return; // Prevent form submission if no genres are selected
		}
		let cityValue = '';
		const unsubscribe = city1.subscribe((value) => {
			cityValue = value;
			console.log('City value store for form:', cityValue);
		});
		unsubscribe();
		if (!cityValue) {
			isCitySelectionInvalid = true; // Mark as invalid if no city is selected
			const citySelect = document.getElementById('city-select');
			citySelect.scrollIntoView({ behavior: 'smooth' }); // Scroll to the city select element
			citySelect.classList.add('flash'); // Add flashing effect to the select box
			console.log('City not selected. Please select a city.');
			return; // Prevent form submission
		} else {
			isCitySelectionInvalid = false;
			const formElement = document.getElementById('genres') as HTMLFormElement;
			if (!formElement) {
				console.error('Form element not found');
				return;
			}

			const formData = new FormData(formElement) as FormDataWithEntries;
			formData.set('selectedGenre', selectedGenres ?? '');

			if (!formData.has('city')) {
				formData.append('city', cityValue ?? '');
			}

			const requiredFields = ['formattedDate', 'city', 'selectedGenre'];
			for (const field of requiredFields) {
				if (!formData.has(field)) {
					console.error(`${field} field is missing in the form data.`);
					return;
				}
			}

			const formDataObj = Object.fromEntries(formData.entries());
			const formDataJson = JSON.stringify(formDataObj);
			const stateKey = Date.now().toString();

			try {
				const response = await fetch('/storestate', {
					method: 'POST',
					body: JSON.stringify({ key: stateKey, state: formDataJson }),
					headers: {
						'Content-Type': 'application/json'
					},
					credentials: 'include'
				});

				if (response.ok) {
					console.log('State stored successfully!');
					goto('/barfindr');
				} else {
					console.error('Error storing state:', response.statusText);
				}
			} catch (error) {
				console.error('Error storing state:', error);
			}
		}
	}
	///////////////////   Login with spotify /////////////////
	/////////////////////////////////////////////////////////

	// Function for the landing page Spotify button click handler
	async function handleSpotifyButtonClick(event: Event) {
		event.preventDefault();
		let cityValue = '';
		const unsubscribe = city1.subscribe((value) => {
			cityValue = value;
			console.log('cityvalue store for form', cityValue);
		});
		unsubscribe();

		if (!cityValue) {
			isCitySelectionInvalid = true; // Mark as invalid if no city is selected
			const citySelect = document.getElementById('city-select');
			citySelect.scrollIntoView({ behavior: 'smooth' }); // Scroll to the city select element
			citySelect.classList.add('flash'); // Add flashing effect to the select box
			console.log('City not selected. Please select a city.');
			return; // Prevent form submission
		} else {
			isCitySelectionInvalid = false;
			const formData = new FormData(
				document.getElementById('city-location') as HTMLFormElement
			) as FormDataWithEntries;

			if (!formData.has('city')) {
				formData.append('city', cityValue || '');
			}

			if (!formData.has('formattedDate')) {
				console.error('FormattedDate field is missing in the form data.');
				return;
			}

			// Convert the form data to a string with URLSearchParams
			const formDataObj = Object.fromEntries(formData.entries());

			// Add a source identifier to help with redirect after auth
			formDataObj.source = 'landing-page';

			const formDataJson = JSON.stringify(formDataObj);
			const stateKey = Date.now().toString();

			try {
				const response = await fetch('/storestate', {
					method: 'POST',
					body: JSON.stringify({ key: stateKey, state: formDataJson }),
					headers: {
						'Content-Type': 'application/json'
					},
					credentials: 'include'
				});

				if (response.ok) {
					console.log('State stored successfully!');
				} else {
					console.error('Error storing state:', response.statusText);
					return;
				}
			} catch (error) {
				console.error('Error storing state:', error);
				return;
			}

			// Redirect to Spotify login page with encoded state
			// Use userClientId which is either from cookie or the default PUBLIC_SPOTIFY_CLIENT_ID
			window.location.href = loggedIn
				? '/spotify'
				: `https://accounts.spotify.com/authorize?client_id=${userClientId}&response_type=code&redirect_uri=${redirectUri}&state=${stateKey}&scope=user-read-recently-played%20user-read-currently-playing%20playlist-read-private%20user-top-read%20user-read-email&show_dialog=true`;
		}
	}

	function handleLoginButtonClick() {
		window.location.href = 'https://www.clubfindr.com/login/users';
	}

	////////////////////// Search a song or artist ////////////////////////
	//////////////////////////////////////////////////////////////////////

	let searchQuery: string;

	async function handleSubmit(event: Event) {
		event.preventDefault();
		let cityValue = '';
		const unsubscribe = city1.subscribe((value) => {
			cityValue = value;
			console.log('cityvalue store for form', cityValue);
		});
		unsubscribe();
		if (!cityValue) {
			isCitySelectionInvalid = true; // Mark as invalid if no city is selected
			const citySelect = document.getElementById('city-select');
			citySelect.scrollIntoView({ behavior: 'smooth' }); // Scroll to the city select element
			citySelect.classList.add('flash'); // Add flashing effect to the select box
			console.log('City not selected. Please select a city.');
			return; // Prevent form submission
		} else {
			isCitySelectionInvalid = false;
			const formData = new FormData(
				document.getElementById('search-form') as HTMLFormElement
			) as FormDataWithEntries;

			if (!formData.has('search')) {
				formData.append('search', searchQuery ?? '');
			}
			if (!formData.has('city')) {
				formData.append('city', cityValue || '');
			}

			if (!formData.has('formattedDate')) {
				console.error('FormattedDate field is missing in the form data.');
				return;
			}

			// Convert the form data to a string with URLSearchParams
			const formDataObj = Object.fromEntries(formData.entries());
			const formDataJson = JSON.stringify(formDataObj);
			const stateKey = Date.now().toString();

			try {
				const response = await fetch('/storestate', {
					method: 'POST',
					body: JSON.stringify({ key: stateKey, state: formDataJson }),
					headers: {
						'Content-Type': 'application/json'
					},
					credentials: 'include'
				});

				if (response.ok) {
					console.log('State stored successfully!');
					goto('/spotify/search');
				} else {
					console.error('Error storing state:', response.statusText);
					return;
				}
			} catch (error) {
				console.error('Error storing state:', error);
				return;
			}
		}
	}
</script>

<svelte:head>
	<title>Clubfindr - Discover Clubs and Bars Based on Music You Love</title>
	<meta
		name="description"
		content="Clubfindr, the platform that helps you find clubs and bars based on your favorite music styles and artists. Discover new places, meet people, and explore the nightlife in your city or any new city."
	/>
	<meta
		name="keywords"
		content="Clubfindr, nightlife, clubs, bars, music, club recommendations, music venues, nightlife guide, find clubs, find bars"
	/>
	<meta name="author" content="Clubfindr Team" />
	<meta property="og:title" content="Clubfindr - Discover Clubs and Bars Based on Music You Love" />
	<meta
		property="og:description"
		content="Clubfindr helps you find clubs and bars that play the music you love. Whether you're looking for new spots in your city or exploring a new one, Clubfindr has got you covered."
	/>
	<meta property="og:image" content="/clubfindr.png" />
	<meta property="og:url" content="https://clubfindr.com" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<form id="city-location" action="/storestate" method="POST">
	<input type="hidden" bind:value={$city1} name="city" />
	<input type="hidden" bind:value={address} name="address" />
	<input
		type="hidden"
		value={formattedDate.toISOString().substring(0, 10).replace(/-/g, '-')}
		name="formattedDate"
	/>
	<button type="button" id="form-submit-button" class="hidden">Submit</button>
</form>
<form id="genres" action="/storestate" method="POST">
	<input type="hidden" bind:value={$city1} name="city" />
	<input type="hidden" bind:value={selectedGenres} name="selectedGenre" />
	<input type="hidden" bind:value={address} name="address" />
	<input
		type="hidden"
		value={formattedDate.toISOString().substring(0, 10).replace(/-/g, '-')}
		name="formattedDate"
	/>
	<button type="button" id="form-submit-button" class="hidden">Submit</button>
</form>

<form id="search-form" action="/spotify/search" method="POST">
	<input type="hidden" bind:value={searchQuery} name="search" />
	<input type="hidden" bind:value={$city1} name="city" />
	<input type="hidden" bind:value={address} name="address" />
	<input
		type="hidden"
		value={formattedDate.toISOString().substring(0, 10).replace(/-/g, '-')}
		name="formattedDate"
	/>
	<button type="button" id="form-submit-button" class="hidden">Submit</button>
</form>

<div>
	<h1
		class="text-4xl md:text-8xl font-bold my-1 md:my-2 text-transparent bg-clip-text bg-gradient-to-br from-light via-light to-secondary"
	>
		ClubFinder
	</h1>
	<p class="text-l md:text-3xl">Your style of music every time</p>
	{#if isUserLoggedIn}
		<p class="text-l md:text-3xl">
			Choose what day then login to find the bar or club playing what you love
		</p>
		<div>
			<DatePicker bind:value={formattedDate} on:change={handleDateChange} />
		</div>
		<p>
			{new Intl.DateTimeFormat('en-GB', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(formattedDate)}
		</p>
	{:else}
		Sign in to find the best bars and clubs playing your favorite music
	{/if}
</div>
{#if userDeniedLocation}
	<p>Please select your city:</p>
	<select
		id="city-select"
		class:isInvalid={isCitySelectionInvalid}
		on:change={handleCitySelection}
		style="color: black;"
	>
		<option value="" selected disabled>Select a city</option>
		{#each cities as city}
			<option value={city.name} style="color: black;">{city.name}</option>
		{/each}
	</select>
	{#if isCitySelectionInvalid}
		<p class="text-red-500 flash">You must select a city before proceeding.</p>
	{/if}
{/if}

<div class="my-6 md:my-14">
	<!-- Conditionally show login button or music service buttons -->
	{#if isUserLoggedIn}
		<!-- Spotify login button -->
		<div class="center-button">
			<a
				href={loggedIn
					? '/spotify'
					: `https://accounts.spotify.com/authorize?client_id=${userClientId}&response_type=code&redirect_uri=${redirectUri}&scope=user-read-recently-played%20user-read-currently-playing%20playlist-read-private%20user-top-read%20user-read-email&show_dialog=true`}
				on:click={handleSpotifyButtonClick}
				role="button"
				class="custom-spotify-button"
				aria-label="Login with Spotify"
			>
				<span>Connect with</span>
				<img
					src="/lib/2024-spotify-full-logo/Full_Logo_Black_PMS_C.svg"
					alt="Spotify Logo"
					class="spotify-logo"
				/>
			</a>
		</div>

		<!-- SoundCloud button -->
		<div class="center-button mt-4">
			<a href="/api/soundcloud/auth">
				<button class="soundcloud-button" aria-label="Login with SoundCloud" />
			</a>
		</div>
	{:else}
		<!-- Login/Signup button -->
		<div class="center-button mt">
			<button on:click={handleLoginButtonClick} class="login-button" aria-label="Login or Sign Up">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="login-icon"
				>
					<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
					<polyline points="10 17 15 12 10 7" />
					<line x1="15" y1="12" x2="3" y2="12" />
				</svg>
				<span class="login-text">Login / Sign Up</span>
			</button>
		</div>
	{/if}
</div>
<!-- Divider between 'login' and 'guest' options -->
<div class="relative flex items-center">
	<div class="flex-grow border-t border-light rounded" />
	<span class="flex-shrink mx-2">or continue as a guest</span>
	<div class="flex-grow border-t border-light rounded" />
</div>

<!-- Main search section -->
<div class="my-8 md:my-16">
	<div class="text-center mb-2">
		<p class="text-l md:text-xl">Find a club that's playing music like</p>
	</div>
	<div class="flex justify-center items-center">
		<!-- Search input -->
		<div class="relative justify-center items-center">
			<input
				type="search"
				bind:value={searchQuery}
				class="h-14 w-80 pl-10 pr-2 z-0 text-black rounded-lg focus:shadow focus:outline-none"
				placeholder="Artist or song..."
			/>
			<!-- Search button -->
			<div class="absolute top-2 right-2">
				<a
					href="/search"
					class="flex justify-center items-center h-10 w-20 text-white rounded-lg bg-secondary hover:opacity-90"
					on:click={(e) => handleSubmit(e)}
				>
					Search
				</a>
			</div>
		</div>
	</div>
	<div class="genre-selection-container flex justify-center items-center mt-4">
		<div class="custom-genre-dropdown relative">
			<!-- Input field triggering the dropdown -->
			<input
				type="text"
				class="custom-genre-input h-14 w-80 pl-10 pr-2 z-0 text-black rounded-lg focus:shadow focus:outline-none"
				placeholder="Select Genre..."
				readonly
				on:click={() => toggleDropdown()}
			/>
			{#if showDropdown}
				<div class="dropdown-menu">
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div class="dropdown-menu-close" on:click={() => toggleDropdown()}>✖</div>
					<!-- Buttons at the top of the dropdown -->
					<div class="p-2 text-black flex justify-between">
						<div class="clear-selection-container">
							<button class="clear-selection-button" on:click={() => clearSelection()}>
								Clear Selection
							</button>
						</div>
						<div class="submit-selection-container">
							<button
								class="submit-selection-button"
								on:click={(event) => handleGenresSearch(event)}
							>
								Find A club
							</button>
						</div>
						<div class="submit-selection-container">
							<button
								class="submit-selection-button"
								on:click={(event) => handleGenresSearchbar(event)}
							>
								Find A Bar
							</button>
						</div>
					</div>
					<!-- Genre search input -->
					<div class="p-2">
						<input
							type="text"
							bind:value={genreSearchQuery}
							class="w-full p-2 border text-black border-gray-300 rounded-lg"
							placeholder="Search genres..."
						/>
					</div>

					<!-- Search results section when a search is active -->
					{#if genreSearchQuery && genreSearchQuery.length >= 2}
						<div class="search-results">
							<h3 class="search-heading">Search Results</h3>

							<ul class="dropdown-list">
								<!-- Category matches -->
								{#each Object.keys(genres).filter((category) => category
										.toLowerCase()
										.includes(genreSearchQuery.toLowerCase())) as category}
									<li class="clickable-area">
										<button
											class="{UserSelectedGenres.includes(category)
												? 'selected'
												: ''} full-clickable search-result category-result"
											on:click={() => handleCategoryClick(category)}
										>
											<span class="result-type">Category:</span>
											{category}
										</button>
									</li>
								{/each}

								<!-- Subgenre matches -->
								{#each Object.keys(genres) as category}
									{#each genres[category].subgenres.filter((subgenre) => {
										const name = typeof subgenre === 'object' ? subgenre.name : subgenre;
										return name.toLowerCase().includes(genreSearchQuery.toLowerCase());
									}) as subgenre}
										<li class="clickable-area">
											<button
												class="{UserSelectedGenres.includes(
													typeof subgenre === 'object' ? subgenre.name : subgenre
												)
													? 'selected'
													: ''} full-clickable search-result subgenre-result"
												on:click={() => {
													selectedCategory = category;
													handleSubgenreClick(subgenre);
												}}
											>
												<span class="result-type">Subgenre:</span>
												{typeof subgenre === 'object' ? subgenre.name : subgenre}
												<span class="result-path">in {category}</span>
											</button>
										</li>
									{/each}
								{/each}

								<!-- Subsubgenre matches -->
								{#each Object.keys(genres) as category}
									{#each genres[category].subgenres as subgenre}
										{#if typeof subgenre === 'object' && subgenre.subsubgenres}
											{#each subgenre.subsubgenres.filter((subsub) => {
												const name = typeof subsub === 'object' ? subsub.name : subsub;
												return name.toLowerCase().includes(genreSearchQuery.toLowerCase());
											}) as subsubgenre}
												<li class="clickable-area">
													<button
														class="{UserSelectedGenres.includes(
															typeof subsubgenre === 'object' ? subsubgenre.name : subsubgenre
														)
															? 'selected'
															: ''} full-clickable search-result subsubgenre-result"
														on:click={() => {
															selectedCategory = category;
															selectedSubgenre = subgenre.name;
															handleSubSubgenreClick(subsubgenre);
														}}
													>
														<span class="result-type">Genre:</span>
														{typeof subsubgenre === 'object' ? subsubgenre.name : subsubgenre}
														<span class="result-path">in {category} → {subgenre.name}</span>
													</button>
												</li>
											{/each}
										{/if}
									{/each}
								{/each}
							</ul>

							<div class="search-footer">
								<button on:click={() => (genreSearchQuery = '')} class="clear-search-button">
									Clear Search
								</button>
							</div>
						</div>
					{:else}
						<!-- Regular navigation when not searching -->
						{#if selectedCategory === null}
							<!-- Category selection view -->
							<ul class="dropdown-list">
								{#each Object.keys(genres) as category}
									<li class="clickable-area">
										<button
											class="{UserSelectedGenres.includes(category)
												? 'selected'
												: ''} full-clickable"
											on:click={() => handleCategoryClick(category)}
										>
											{category}
										</button>
									</li>
								{/each}
							</ul>
						{:else if selectedSubgenre === null}
							<!-- Subgenre selection view -->
							<ul class="dropdown-list">
								<li>
									<button
										class="back-button full-clickable"
										on:click={() => handleBack('category')}
									>
										← Back to Categories
									</button>
								</li>
								<li class="select-all-area">
									<button class="select-all-button" on:click={() => handleSelectAll('subgenres')}>
										Select All
									</button>
								</li>

								{#each genres[selectedCategory].subgenres as subgenre}
									<li class="clickable-area">
										<button
											class="{UserSelectedGenres.includes(subgenre.name)
												? 'selected'
												: ''} full-clickable"
											on:click={() => handleSubgenreClick(subgenre)}
										>
											{subgenre.name}
											{subgenre.subsubgenres && subgenre.subsubgenres.length > 0 ? ' ➔' : ''}
										</button>
									</li>
								{/each}
							</ul>
						{:else if selectedSubSubgenre === null}
							<!-- Subsubgenre GROUPS selection view -->
							<ul class="dropdown-list">
								<li>
									<button
										class="back-button full-clickable"
										on:click={() => handleBack('subgenre')}
									>
										← Back to {selectedCategory}
									</button>
								</li>
								<li class="select-all-area">
									<button
										class="select-all-button"
										on:click={() => handleSelectAll('subsubgenres')}
									>
										Select All
									</button>
								</li>

								{#if genres[selectedCategory].subgenres.find((s) => s.name === selectedSubgenre)}
									{#if genres[selectedCategory].subgenres.find((s) => s.name === selectedSubgenre).subsubgenres}
										{#each genres[selectedCategory].subgenres.find((s) => s.name === selectedSubgenre).subsubgenres as subsubgenreGroup}
											<li class="clickable-area">
												<button
													class="{UserSelectedGenres.includes(subsubgenreGroup.name)
														? 'selected'
														: ''} full-clickable"
													on:click={() => handleSubSubgenreGroupClick(subsubgenreGroup)}
												>
													{subsubgenreGroup.name}
													{subsubgenreGroup.genres && subsubgenreGroup.genres.length > 0
														? ' ➔'
														: ''}
												</button>
											</li>
										{/each}
									{:else}
										<li class="info-message">No subgenre groups found for {selectedSubgenre}</li>
									{/if}
								{:else}
									<li class="info-message">Subgenre {selectedSubgenre} not found</li>
								{/if}
							</ul>
						{:else}
							<!-- Specific Genres selection view -->
							<ul class="dropdown-list">
								<li>
									<button
										class="back-button full-clickable"
										on:click={() => handleBack('subsubgenre')}
									>
										← Back to {selectedSubgenre}
									</button>
								</li>
								<li class="select-all-area">
									<button
										class="select-all-button"
										on:click={() => handleSelectAll('specificGenres')}
									>
										Select All
									</button>
								</li>

								{#if genres[selectedCategory].subgenres.find((s) => s.name === selectedSubgenre)}
									{#if genres[selectedCategory].subgenres.find((s) => s.name === selectedSubgenre).subsubgenres}
										{#if genres[selectedCategory].subgenres
											.find((s) => s.name === selectedSubgenre)
											.subsubgenres.find((g) => g.name === selectedSubSubgenre)}
											{#each genres[selectedCategory].subgenres
												.find((s) => s.name === selectedSubgenre)
												.subsubgenres.find((g) => g.name === selectedSubSubgenre).genres as specificGenre}
												<li class="clickable-area">
													<button
														class="{UserSelectedGenres.includes(specificGenre)
															? 'selected'
															: ''} full-clickable"
														on:click={() => handleSpecificGenreClick(specificGenre)}
													>
														{specificGenre}
													</button>
												</li>
											{/each}
										{:else}
											<li class="info-message">
												Subsubgenre group {selectedSubSubgenre} not found
											</li>
										{/if}
									{:else}
										<li class="info-message">No subsubgenre groups found</li>
									{/if}
								{:else}
									<li class="info-message">Subgenre {selectedSubgenre} not found</li>
								{/if}
							</ul>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(body) {
		--date-picker-foreground: #f7f7f7;
		--date-picker-background: #16171c;
		--date-picker-highlight-border: hsl(var(--deg), 98%, 49%);
		--date-picker-highlight-shadow: hsla(var(--deg), 98%, 49%, 50%);
		--date-picker-selected-color: hsl(var(--deg), 100%, 85%);
		--date-picker-selected-background: hsla(var(--deg), 98%, 49%, 20%);
		color: #ffffff;
		transition: all 80ms ease-in-out;
		font-size: 14px;
	}

	div > :global(*) {
		margin-bottom: 10px;
	}

	.flex {
		display: flex;
	}

	.items-center {
		align-items: center;
	}

	form {
		display: flex;
		flex-direction: column;
	}

	.genre-selection-container {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 1rem;

		/* Prevent scrollable box outside the menu */
	}

	.custom-genre-dropdown {
		position: relative;
	}

	.custom-genre-input {
		height: 3.5rem;
		width: 20rem; /* This width sets the width of the dropdown as well */
		padding-left: 2.5rem;
		padding-right: 0.5rem;
		z-index: 0;
		color: black;
		border-radius: 0.5rem;
		box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.1);
		outline: none;
		cursor: pointer;
	}
	.back-button {
		background-color: #f0f0f0;
		font-weight: bold;
		color: #333;
		padding: 10px;
		border-radius: 4px;
		margin-bottom: 8px;
		transition: background-color 0.2s;
	}

	.back-button:hover {
		background-color: #e0e0e0;
	}
	.dropdown-menu {
		position: absolute;
		top: auto;
		bottom: 100%;
		left: 0;
		width: 100%; /* Match the width of the custom-genre-input */
		background-color: white;
		border: 1px solid #ccc;
		border-radius: 0.5rem;
		z-index: 10;
		max-height: 300px;
		box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
		margin-top: 0.5rem;
	}

	.dropdown-list {
		max-height: 300px;
		overflow-y: scroll;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.dropdown-list li {
		padding: 10px;
		cursor: pointer;
		background: #f7f7f7;
		border-bottom: 1px solid #ccc;
		color: black;
	}

	.full-clickable {
		width: 100%;
		height: 100%;
		padding: 10px;
		text-align: left;
		background: #f7f7f7;
		border: none;
		cursor: pointer;
		display: block; /* Make the button behave like a block element */
		border-bottom: 1px solid #ccc;
		color: black;
		box-sizing: border-box;
		transition: background-color 0.3s ease;
	}

	.full-clickable:hover {
		background-color: #eaeaea;
	}

	.dropdown-list li:hover {
		background: #004494;
	}

	.selected {
		background-color: #0056b3;
		color: white;
	}
	.clear-selection-container {
		background-color: #20c211; /* Light red */
		border-radius: 5px;
		padding: 5px 10px;
		margin-right: 10px;
		display: flex;
		align-items: center;
	}

	.clear-selection-button {
		color: white;
		font-weight: bold;
		background: none;
		border: none;
		cursor: pointer;
	}

	.clear-selection-button:hover {
		color: darkred;
	}

	.submit-selection-container {
		background-color: #367da7;
		border-radius: 5px;
		padding: 5px 10px;
		display: flex;
		align-items: center;
	}

	.submit-selection-button {
		color: white;
		font-weight: bold;
		background: none;
		border: none;
		cursor: pointer;
	}

	.submit-selection-button:hover {
		color: darkgreen;
	}
	.select-all-button {
		display: block;
		width: 100%;
		padding: 10px;
		text-align: center;
		background-color: #f0f0f0;
		border: 1px solid #ccc;
		cursor: pointer;
	}

	.select-all-button:hover {
		background-color: #e0e0e0;
	}

	.login-button {
		/* existing properties */
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.login-icon {
		display: inline-flex; /* This helps with alignment */
		vertical-align: middle; /* Helps align with text */
		margin-right: 8px; /* Space between icon and text */
	}

	.custom-spotify-button {
		background-color: #1db954; /* Spotify green */
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px 12px;
		border-radius: 6px;
		font-weight: bold;
		text-decoration: none;
		width: 100%;
		max-width: 350px;
		height: 50px; /* Adjust as needed */
		cursor: pointer;
	}

	.custom-spotify-button:hover {
		opacity: 0.9;
	}

	.custom-spotify-button span {
		margin-right: 8px;
		font-size: 24px;
	}

	.spotify-logo {
		height: 34px; /* Adjust to scale the logo */
		width: auto;
	}
	.center-button {
		display: flex;
		justify-content: center;
	}
	.login-text {
		font-size: 20px; /* Explicit font size for the text */
	}

	.soundcloud-button {
		background-image: url('https://connect.soundcloud.com/2/btn-connect-sc-m.png');
		background-size: contain;
		background-repeat: no-repeat; /* Prevents the image from repeating */
		background-position: center;
		width: 100%;
		max-width: 350px; /* Adjust size as needed */
		height: 50px; /* Adjust size as needed */
		border: none;
		cursor: pointer;
	}
	.search-results {
		max-height: 300px;
		overflow-y: auto;
	}

	.search-heading {
		padding: 10px;
		background-color: #f0f0f0;
		color: #333;
		font-weight: bold;
		border-bottom: 1px solid #ccc;
		margin: 0;
	}

	.search-result {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 10px;
	}

	.result-type {
		font-size: 0.8em;
		color: #666;
		margin-bottom: 2px;
	}

	.result-path {
		font-size: 0.8em;
		color: #999;
		margin-top: 2px;
	}

	.category-result {
		background-color: #f8f8f8;
	}

	.subgenre-result {
		background-color: #f0f0f0;
	}

	.subsubgenre-result {
		background-color: #e8e8e8;
	}

	.search-footer {
		padding: 10px;
		text-align: center;
		border-top: 1px solid #ccc;
	}

	.clear-search-button {
		background-color: #f5f5f5;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 5px 10px;
		color: #666;
		cursor: pointer;
	}

	.clear-search-button:hover {
		background-color: #e5e5e5;
	}
	@media (max-width: 768px) {
		.genre-selection-container {
			display: flex;
			justify-content: center;
			align-items: center;
			margin-top: 1rem;
			/* Prevent scrollable box outside the menu */
		}

		.custom-genre-dropdown {
			position: relative;
		}

		.custom-genre-input {
			height: 3.5rem;
			width: 20rem; /* This width sets the width of the dropdown as well */
			padding-left: 2.5rem;
			padding-right: 0.5rem;
			z-index: 1000;
			color: black;
			border-radius: 0.5rem;
			box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.1);
			outline: none;
			cursor: pointer;
		}
		.dropdown-menu {
			padding-top: 10%;
			position: fixed; /* Position the dropdown menu fixed to the screen */
			top: 5%;
			left: 0;
			right: 0;
			bottom: 0;
			width: 100%; /* Full width */
			height: 100%; /* Full height */
			background-color: white; /* Ensure background covers the content */
			z-index: 1000; /* High z-index to cover other content */
			box-shadow: none; /* Remove box-shadow for a cleaner look */
			padding: 1rem; /* Optional: add padding for content spacing */
		}
		.dropdown-list {
			max-height: 600px;
			overflow-y: scroll;
			list-style: none;
			padding: 0;
			margin: 0;
		}

		/* Optional: Style for the close button or any top bar */
		.dropdown-menu-close {
			position: absolute;
			top: 1rem;
			right: 1rem;
			font-size: 1.5rem;
			cursor: pointer;
			color: black;
		}
		/* Flashing effect for the invalid select box */
		.flash {
			animation: flash 0.5s ease-in-out 0s 2;
		}

		@keyframes flash {
			0% {
				border-color: transparent;
			}
			50% {
				border-color: red;
			}
			100% {
				border-color: transparent;
			}
		}
	}
</style>
