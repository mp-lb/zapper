# Onboarding Guard

An onboarding guard is a UI-level gate that sends a signed-in user through initial setup before showing the main product.

The guard checks for a persisted setup record. Most projects use the user profile, but the record can also be a settings document, tenant configuration, workspace record, or any other object that represents "this account has been initialized."

## Pattern

1. After authentication, load a small onboarding status endpoint.
2. The endpoint checks whether the setup record exists.
3. If the record is missing, render the onboarding flow instead of the main app.
4. When onboarding completes, create or update the setup record.
5. Refresh the status and let the user into the product.

## API Behavior

Only the minimal API surface needs to work before onboarding:

- read onboarding status;
- complete onboarding;
- load any metadata needed to render the shell.

Other product APIs may fail until setup is complete. Prefer making the app tolerate this state, but the guard should lead users down the happy path so they do not hit incomplete product screens.

## Record Choice

Choose a record that naturally represents initial configuration.

Good candidates:

- user profile;
- organization or tenant settings;
- workspace configuration;
- product-specific preferences required before normal use.

Avoid creating a separate onboarding flag when the existence of a real setup record already answers the question. The guard should reflect product state, not duplicate it.

## Implementation Notes

Keep the status endpoint small and stable. Return a boolean such as `isOnboarded` plus any defaults the onboarding UI needs.

Keep the guard in the app shell or route layer. Product screens should not each reimplement onboarding checks.

Treat onboarding as guidance, not a security boundary. Authorization and data validation still belong in the backend procedures that need them.