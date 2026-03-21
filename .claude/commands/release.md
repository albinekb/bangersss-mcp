Release a new version of bangersss-mcp to npm.

## Steps

1. Run `npm run typecheck` and `npm test` to make sure everything passes. Stop if anything fails.
2. Determine the version bump. If the user specified a version or bump type (patch/minor/major), use that. Otherwise, look at commits since the last tag (`git log $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~5)..HEAD --oneline`) and decide:
   - `patch` for bug fixes
   - `minor` for new features
   - `major` for breaking changes
   Confirm with the user before proceeding.
3. Run `npm version <patch|minor|major>` to bump the version and create a git tag.
4. Push the commit and tag: `git push && git push --tags`
5. Publish to npm using 1Password for the OTP:
   ```
   npm publish --access public --otp=$(op item get ptepmkqrer4ihzbaoni4kyxija --otp)
   ```
6. Verify the publish succeeded by running `npm view bangersss-mcp version`.
7. Report the published version and npm URL to the user.
