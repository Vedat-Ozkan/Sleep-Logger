Project Overview
Transform an existing React Native sleep tracking app to be more impressive for ATS scanners and hiring managers targeting frontend/fullstack/SWE roles at startups and enterprises in Canada/US.
Current State

React Native app with gesture-based timeline UI using Reanimated worklets
SQLite for offline-first data persistence
UTC-based time handling with timezone conversion
Push notifications for sleep/wake logging
Pre-computed day indices for calendar optimization

Phase 1: Quick Wins (4-6 hours total)
Task 1.1: Add Error Monitoring with Sentry (30 minutes)
npm install @sentry/react-native
 Sign up for free Sentry account at https://sentry.io
 Initialize Sentry in App.tsx or index.js
 Add Sentry.captureException() to existing try-catch blocks
 Test with a deliberate error to confirm dashboard reporting
 Add performance monitoring with Sentry.startTransaction()

Task 1.3: Setup GitHub Actions CI/CD (30 minutes)
Create .github/workflows/ci.yml:
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run lint
      - run: npm test

Create the workflow file
 Ensure package.json has lint and test scripts
 Push to GitHub and verify green checkmark

 Task 1.4: Add Jest Unit Tests (2-3 hours)
npm install --save-dev @testing-library/react-native jest

Create __tests__ directory
 Write tests for:

 Sleep duration calculation utility
 Timezone conversion functions
 Date formatting utilities
 SQLite CRUD operations (mock the database)
 At least 2 component snapshot tests


 Aim for 50-60% coverage minimum
 Add coverage script to package.json: "test:coverage": "jest --coverage"

 Task 4.2: Enhanced README (30 minutes)
Update README.md with:

 Architecture diagram
 Performance metrics (app size, load time, frame rate)
 Test coverage badge
 Setup instructions
 API documentation link
 Screenshots/GIFs of key features

 Task 4.4: Create Release Pipeline (1 hour)
 Add GitHub Action for automated releases
 Setup semantic versioning
 Add changelog generation
 Create build scripts for Android