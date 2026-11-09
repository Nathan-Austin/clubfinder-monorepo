require('dotenv').config({ path: '/home/nathan/clubfinder/clubfindr/.env' });

module.exports = {
	apps: [
		{
			name: 'clubfindr',
			script: 'build/index.js',
			// Pinned so the app runs on Node 24 whichever Node the PM2 daemon uses.
			// ~/.local/node24 links to the nvm install (see deploy/deploy.sh).
			interpreter: '/home/nathan/.local/node24/bin/node',
			cwd: '/home/nathan/clubfinder/clubfindr',
			instances: 1,
			exec_mode: 'fork',
			env: {
				NODE_ENV: 'production',
				PORT: 3000,
				...process.env,
				// Loopback only: nginx (deploy/nginx/sveltekit.config) is the way in, so every
				// request carries Cloudflare's CF-Connecting-IP for the rate limiter. Set after
				// the spread so a stray HOST in the environment cannot re-open it to the internet.
				HOST: '127.0.0.1'
			},
			// Logging
			error_file: '/home/nathan/.pm2/logs/clubfindr-error-0.log',
			out_file: '/home/nathan/.pm2/logs/clubfindr-out-0.log',
			merge_logs: true,
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
			// Restart behavior
			max_restarts: 10,
			min_uptime: '10s',
			max_memory_restart: '500M',
			// Watch (disabled in production)
			watch: false,
			ignore_watch: ['node_modules', 'logs', '.git']
		}
	]
};
