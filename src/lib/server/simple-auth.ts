import { env } from '$env/dynamic/private';

export const AUTH_COOKIE_NAME = 'wishlist_auth';
const AUTH_COOKIE_VALUE = 'authenticated';

export function getLoginCredentials() {
	return {
		username: env.TEST_LOGIN_USERNAME ?? 'test',
		password: env.TEST_LOGIN_PASSWORD ?? 'test'
	};
}

export function isAuthenticated(cookieValue: string | undefined) {
	return cookieValue === AUTH_COOKIE_VALUE;
}

export function getAuthCookieValue() {
	return AUTH_COOKIE_VALUE;
}
