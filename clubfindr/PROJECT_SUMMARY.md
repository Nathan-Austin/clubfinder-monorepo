# ClubFindr Project Summary

## Project Structure

### Routes Overview

The project is a comprehensive web application with multiple route categories:

1. **Authentication Routes**:

   - `/login`: User and bar login
   - `/register`: User and promoter registration
   - `/logout`: Logout functionality
   - `/password-reset`: Password reset process
   - `/register/confirm`: Email confirmation

2. **Main Application Routes**:

   - `/`: Home/Landing page
   - `/bars`: Bar listings
   - `/clubs`: Club listings
   - `/users-home`: User dashboard
   - `/promoter-home`: Promoter dashboard

3. **Music Integration Routes**:

   - `/spotify`: Spotify integration and search
   - `/soundcloud`: SoundCloud integration
   - `/soundtrack`: Music-related features
   - `/selectedGenres`: Genre selection

4. **API Routes**:

   - `/api/`: Multiple server-side endpoints for:
     - User management
     - Authentication
     - Artist search
     - Venue search
     - External service integrations (Spotify, SoundCloud)

5. **Policy and Information Routes**:
   - `/about`: About pages
   - `/policies`: Legal documents
   - `/delete-confirmation`: User data deletion

### Key Components and Features

1. **Authentication**

   - User registration (regular users and promoters)
   - Email confirmation
   - Password reset
   - Login for different user types

2. **Music Discovery**

   - Spotify artist and track search
   - SoundCloud integration
   - Genre selection
   - Music-related recommendations

3. **Venue Discovery**

   - Bar and club listings
   - Venue search functionality

4. **User Management**

   - User profiles
   - Promoter dashboards
   - User data update
   - Account deletion

5. **External Integrations**
   - Spotify API
   - SoundCloud API
   - CAPTCHA verification

### Technical Architecture

- **Framework**: SvelteKit
- **Routing**: File-based routing with server-side and client-side components
- **State Management**: Custom stores (likely using Svelte stores)
- **Authentication**: Custom server-side authentication
- **API**: RESTful and server-side endpoints

### Notable Libraries/Technologies

- TypeScript
- Svelte/SvelteKit
- Tailwind CSS (based on config)
- Playwright (for testing)

### Security Features

- Password encryption
- Email verification
- CAPTCHA protection
- Secure API endpoints
- Cookie consent management

### Potential Future Improvements

- Enhanced music recommendation algorithms
- More comprehensive venue filtering
- Advanced user preference tracking
