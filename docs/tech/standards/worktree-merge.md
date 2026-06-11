# How to merge changes from a worktree branch

- Make sure changes are committed to a branch like worktree/some-feature
- Get the base repo path:

```sh
base="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
```

- Abort if the base repo is dirty:

```sh
git -C "$base" diff --quiet &&
git -C "$base" diff --cached --quiet
```

- Ensure the base repo is on `main`:

```sh
test "$(git -C "$base" branch --show-current)" = main
```

- Merge the worktree branch into `main`:

```sh
git -C "$base" merge "$branch"
```

