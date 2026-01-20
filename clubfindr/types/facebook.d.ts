export interface FacebookAuthResponse {
	accessToken: string;
	expiresIn: number;
	signedRequest?: string;
	userID: string;
}

export interface FacebookLoginResponse {
	status: 'connected' | 'not_authorized' | 'unknown';
	authResponse: FacebookAuthResponse | null;
}
