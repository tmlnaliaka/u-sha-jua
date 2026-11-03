# Contributing to u-SHA-jua

Thank you for contributing to **u-SHA-jua** (*Sovereign Geospatial Disaster Informatics Platform*).

## Development Workflow
1. **Branching & Commits**: Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
2. **Test-Driven Development (TDD)**: Add or update unit/integration tests in `server/tests/` before or alongside any backend endpoint change.
3. **Zero Hardcoded Secrets**: Never commit `.env` files or real API keys. Update `server/.env.example` or `client/.env.example` when introducing new configuration variables.
4. **Pre-PR Verification**:
   ```bash
   # 1. Backend tests (must pass 100%)
   cd server && pytest -v

   # 2. Frontend strict TypeScript & Vite bundle check
   cd ../client && npm run build
   ```

