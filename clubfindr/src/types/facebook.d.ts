// Type definitions for Facebook SDK

export interface FacebookAuthResponse {
	accessToken: string;
	userID: string;
	expiresIn: number;
	signedRequest: string;
}

export interface FacebookLoginResponse {
	status: 'connected' | 'not_authorized' | 'unknown';
	authResponse?: FacebookAuthResponse;
}

export interface FacebookSDK {
	init(params: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;

	login(callback: (response: FacebookLoginResponse) => void, options?: { scope?: string }): void;

	getLoginStatus(callback: (response: FacebookLoginResponse) => void): void;

	AppEvents: {
		logPageView(): void;
	};
}

declare global {
	interface Window {
		FB: {
			init(params: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;

			login(
				callback: (response: FacebookLoginResponse) => void,
				options?: { scope?: string }
			): void;

			getLoginStatus(callback: (response: FacebookLoginResponse) => void): void;

			AppEvents: {
				logPageView(): void;
			};
		};
	}
}

export {};
