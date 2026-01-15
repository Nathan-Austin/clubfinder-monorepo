# Monorepo Migration Guide

This document details the migration from individual repositories to a monorepo structure.

## Migration Date

January 15, 2026

## Previous Repository Structure

### Individual Repositories

1. **clubfindr**
   - Remote: `git@github.com:Nathan-Austin/clubfinder.git`
   - Last commit: `c9c11910` - "Update API endpoints and add redirect route"
   - Git history size: 60MB

2. **barfindr**
   - Remote: `git@github.com:Nathan-Austin/barfindr.git`
   - Last commit: `deb4094` - "Update cache and celerybeat schedule"
   - Git history size: 1.4MB

3. **data_collection**
   - Remote: `https://github.com:Nathan-Austin/event_data_scraper.git`
   - Last commit: `d9498b9` - "Add venue coordinate scripts and update event fetcher"
   - Git history size: 7.2MB

4. **spotify_service**
   - Remote: `git@github.com:Nathan-Austin/spotify-service.git`
   - Last commit: `64b32b6` - "Update service configuration and cleanup"
   - Git history size: 776KB

5. **app_clubfindr**
   - Not previously under version control
   - To be added from local Expo project

## Migration Steps Performed

### 1. Committed All Changes

All uncommitted changes in each repository were committed to preserve work:
- clubfindr: 6 files (API endpoints, redirect route)
- barfindr: 3 files (cache, celerybeat)
- data_collection: 5 files (coordinate scripts, event fetcher)
- spotify_service: 4 files (service config, app info)

### 2. Created Backups

Individual .git directories were backed up to `.git-backups/`:
```
.git-backups/
├── clubfindr-git-backup/
├── barfindr-git-backup/
├── data_collection-git-backup/
├── spotify_service-git-backup/
└── README.md
```

These backups are:
- Stored locally only (in .gitignore)
- Contain full git history
- Can be restored if needed

### 3. Initialized Monorepo

- Removed individual .git directories from subdirectories
- Initialized new git repository at `/home/nathan/clubfinder`
- Created comprehensive .gitignore for all components

### 4. Set Up CI/CD

Created GitHub Actions workflows:
- `main-ci.yml` - Orchestrator with path filtering
- `clubfindr-ci.yml` - Web app workflow
- `barfindr-ci.yml` - Backend workflow
- `data-collection-ci.yml` - Data scraping workflow
- `spotify-service-ci.yml` - Automation service workflow
- `app-clubfindr-ci.yml` - Mobile app workflow (ready for app)

### 5. Documentation

Created monorepo documentation:
- `README.md` - Main repository documentation
- `CLAUDE.md` - Updated for monorepo structure
- `MONOREPO_MIGRATION.md` - This file

## Benefits of Monorepo Structure

### Advantages

1. **Unified Development**
   - Single clone for all components
   - Easier cross-component changes
   - Consistent versioning across all parts

2. **Simplified CI/CD**
   - Single set of GitHub Actions workflows
   - Path-based triggering reduces CI time
   - Shared secrets and configuration

3. **Better Coordination**
   - Atomic commits across multiple components
   - Single source of truth for project state
   - Easier to maintain consistency

4. **Reduced Overhead**
   - One repository to maintain
   - Single PR for related changes
   - Simplified dependency management

### Potential Challenges

1. **Repository Size**
   - Combined git history: ~69MB
   - Large node_modules in multiple directories
   - Mitigated by: .gitignore, sparse checkout options

2. **Build Times**
   - Multiple components to build
   - Mitigated by: path filtering, caching, parallel jobs

3. **Access Control**
   - Can't grant per-component access easily
   - All developers have access to all code
   - Not an issue for this project

## Restoring Individual Repos

If you need to restore the original repository structure:

### Restore Single Component

```bash
cd /home/nathan/clubfinder/clubfindr
rm -rf .git
cp -r ../.git-backups/clubfindr-git-backup .git
git remote -v  # Verify remote is correct
git status     # Check current state
```

### Restore All Components

```bash
cd /home/nathan/clubfinder

for dir in clubfindr barfindr data_collection spotify_service; do
  echo "Restoring $dir..."
  rm -rf "$dir/.git"
  cp -r ".git-backups/${dir}-git-backup" "$dir/.git"
done

echo "All repositories restored!"
```

## GitHub Repository Setup

After migration, you'll need to:

### 1. Create New GitHub Repository

```bash
# On GitHub, create new repo: clubfinder-monorepo
# Then push the monorepo:

git remote add origin git@github.com:Nathan-Austin/clubfinder-monorepo.git
git add .
git commit -m "chore: initial monorepo setup"
git push -u origin main
```

### 2. Configure Secrets

Add these secrets in GitHub repository settings:

**For clubfindr:**
- `VITE_PG_HOST`
- `VITE_PG_PORT`
- `VITE_PG_DB`
- `VITE_PG_USERNAME`
- `VITE_PG_PASSWORD`

**For app_clubfindr (optional):**
- `EXPO_TOKEN`

### 3. Archive Old Repositories

On GitHub, for each old repository:
1. Go to repository Settings
2. Scroll to "Danger Zone"
3. Click "Archive this repository"
4. Add note: "Migrated to monorepo at [new-repo-url]"

## Future Considerations

### Adding New Components

When adding new components to the monorepo:

1. Create directory in root
2. Add to .gitignore if needed
3. Create GitHub Actions workflow
4. Update main-ci.yml to include new component
5. Update README.md and CLAUDE.md

### Submodules vs Monorepo

We chose monorepo over submodules because:
- Simpler workflow (no submodule commands)
- Easier to make cross-component changes
- Single CI/CD configuration
- No nested repository issues

### Workspace Tools

Consider adding workspace tools in the future:
- **Turborepo** - For optimized builds and caching
- **Nx** - For advanced monorepo management
- **Lerna** - For package publishing and versioning

Currently not needed due to project size.

## Rollback Plan

If issues arise with monorepo structure:

1. Restore individual repos from .git-backups
2. Push each to its original remote
3. Continue development in separate repos
4. All work is preserved in backups

## Questions or Issues?

If you encounter issues with the monorepo structure:
1. Check this document for solutions
2. Review .git-backups/README.md for restore instructions
3. Consult README.md for current workflow
4. Individual git histories are preserved in backups

## Notes

- Original GitHub repositories remain untouched (not deleted or modified)
- All git history is preserved in backups
- Migration can be reversed if needed
- CI/CD is fully configured and ready to use
