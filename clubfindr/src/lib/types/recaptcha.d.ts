declare global {
	interface Window {
		grecaptcha: {
			ready: (callback: () => void) => void;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			render: (container: string | HTMLElement, options: any) => number;
			reset: (widget: number) => void;
		};
	}
}
