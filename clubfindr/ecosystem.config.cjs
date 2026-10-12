require('dotenv').config({ path: '/home/nathan/clubfinder/clubfindr/.env' });

module.exports = {
	apps: [
		{
			name: 'clubfindr',
			script: 'build/index.js',
			cwd: '/home/nathan/clubfinder/clubfindr',
			instances: 1,
			exec_mode: 'fork',
			env: {
				NODE_ENV: 'production',
				PORT: 3000,
				...process.env
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
