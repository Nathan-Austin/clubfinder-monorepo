# Next Steps - Clubfinder Monorepo

## ✅ Completed

Your monorepo is now fully set up and ready to use! Here's what was done:

### 1. Committed All Changes
All uncommitted work in individual repos was committed:
- clubfindr: API endpoints and redirect route
- barfindr: Cache and celerybeat updates
- data_collection: Venue coordinate scripts
- spotify_service: Service configuration

### 2. Created Backups
Individual git histories backed up to `.git-backups/`:
- clubfindr-git-backup (60MB history)
- barfindr-git-backup (1.4MB history)
- data_collection-git-backup (7.2MB history)
- spotify_service-git-backup (776KB history)

### 3. Initialized Monorepo
- Removed individual .git directories
- Initialized new git repository at root
- Created comprehensive .gitignore for all components

### 4. Set Up CI/CD
Created 6 GitHub Actions workflows:
- main-ci.yml (orchestrator)
- clubfindr-ci.yml
- barfindr-ci.yml
- data-collection-ci.yml
- spotify-service-ci.yml
- app-clubfindr-ci.yml

### 5. Created Documentation
- README.md - Main monorepo documentation
- CLAUDE.md - Updated for monorepo structure
- MONOREPO_MIGRATION.md - Migration details
- NEXT_STEPS.md - This file

### 6. Initial Commit
Created monorepo commit: `d442acd`

## 📱 Expo App Already Present!

Good news: Your Expo mobile app is already in the repo at `app_clubfindr/clubfindr_app/`!

**Note:** It's currently an embedded git repository (git submodule-like). This is fine for now, but you may want to flatten it:

```bash
# Optional: Remove the embedded .git to fully integrate it
cd app_clubfindr/clubfindr_app
rm -rf .git
cd ../..
git add app_clubfindr/clubfindr_app
git commit -m "chore(app_clubfindr): integrate mobile app into monorepo"
```

## 🚀 Next Steps

### 1. Create GitHub Repository

```bash
# On GitHub, create a new repository
# Repository name: clubfinder-monorepo (or your preferred name)
# Don't initialize with README (we already have one)

# Then add the remote and push:
git remote add origin git@github.com:Nathan-Austin/clubfinder-monorepo.git
git push -u origin main
```

### 2. Configure GitHub Secrets

Go to your new repository on GitHub → Settings → Secrets and variables → Actions

Add these secrets:

**For clubfindr (required):**
- `VITE_PG_HOST` - PostgreSQL host
- `VITE_PG_PORT` - PostgreSQL port (usually 5432)
- `VITE_PG_DB` - Database name (clubfindr)
- `VITE_PG_USERNAME` - Database user
- `VITE_PG_PASSWORD` - Database password

**For app_clubfindr (optional, for building on GitHub):**
- `EXPO_TOKEN` - Get from https://expo.dev/accounts/[account]/settings/access-tokens

### 3. Test CI/CD Workflows

After pushing to GitHub, the workflows will automatically run. Check the Actions tab to see:
- Which workflows are triggered (based on what files changed)
- Build status for each component
- Any errors that need fixing

### 4. Update Your Local Git Config

```bash
# Set your name and email if not already set
git config user.name "Nathan Austin"
git config user.email "your-email@example.com"
```

### 5. Archive Old Repositories (Optional)

On GitHub, for each old repository:

1. **clubfinder** → Archive and add note: "Migrated to monorepo"
2. **barfindr** → Archive and add note: "Migrated to monorepo"
3. **event_data_scraper** → Archive and add note: "Migrated to monorepo"
4. **spotify-service** → Archive and add note: "Migrated to monorepo"

This keeps them available for reference but makes it clear they're no longer active.

## 📝 Development Workflow

### Making Changes

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes in relevant component directory
cd clubfindr
# ... make changes ...

# Commit with conventional commit message
git add .
git commit -m "feat(clubfindr): add new feature"

# Push and create PR
git push origin feature/your-feature-name
```

### Running Components Locally

**clubfindr:**
```bash
cd clubfindr
pnpm install
pnpm dev  # http://localhost:3000
```

**barfindr:**
```bash
cd barfindr
pip install -r requirements.txt
uvicorn src.barfindr.main:app --reload
```

**data_collection:**
```bash
cd data_collection
pip install -r requirements.txt
./run_data_collection.sh
```

**spotify_service:**
```bash
cd spotify_service
./manage_spotify_service.sh start
```

**app_clubfindr (Expo app):**
```bash
cd app_clubfindr/clubfindr_app
npm install
npx expo start
```

## 🔧 Troubleshooting

### If You Need to Restore Original Repos

```bash
# See .git-backups/README.md for instructions
# Example:
cd clubfindr
rm -rf .git
cp -r ../.git-backups/clubfindr-git-backup .git
git remote -v  # Verify
```

### If Expo App Has Issues

The app is currently an embedded git repo. If you encounter issues:

```bash
# Option 1: Remove the embedded .git
cd app_clubfindr/clubfindr_app
rm -rf .git

# Option 2: Use it as a git submodule
git rm --cached app_clubfindr/clubfindr_app
git submodule add <repo-url> app_clubfindr/clubfindr_app
```

### If CI Workflows Fail

Common issues:
- **Missing secrets**: Add required secrets in GitHub
- **Dependency cache**: Clear cache in Actions settings
- **Node/Python version**: Update workflow files if needed

## 📚 Documentation

- **README.md** - Quick start and overview
- **CLAUDE.md** - Detailed development guide (for Claude Code)
- **MONOREPO_MIGRATION.md** - Migration details and history
- **Component READMEs** - See individual directories

## 🎉 You're All Set!

Your monorepo is ready. Just:
1. Create GitHub repo
2. Push: `git push -u origin main`
3. Configure secrets
4. Start developing!

## Questions?

If you need help:
- Check documentation in README.md
- Review CLAUDE.md for detailed guidance
- Check MONOREPO_MIGRATION.md for migration details
- Git history is preserved in .git-backups/

Happy coding! 🚀
