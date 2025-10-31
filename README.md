# Retest Failed CI

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that automatically re-triggers all failed CI workflow runs when
someone comments "/retest" on a pull request. :rocket:

## Features

- 🔄 Automatically re-runs failed, timed-out, and cancelled workflows
- 💬 Triggered by commenting `/retest` (or custom phrase) on a PR
- 🎯 Only reruns workflows that actually failed
- 📊 Reports the number of workflows re-triggered
- ⚙️ Configurable trigger phrase

## Usage

To use this action, create a workflow file (e.g.,
`.github/workflows/retest.yml`) in your repository:

```yaml
name: Retest Failed CI

on:
  issue_comment:
    types: [created]

jobs:
  retest:
    # Only run on pull request comments
    if: github.event.issue.pull_request
    runs-on: ubuntu-latest
    permissions:
      actions: write # Required to re-run workflows
      contents: read
      pull-requests: read

    steps:
      - name: Retest Failed CI
        uses: huntersman/retest-failed-CI@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input            | Description                                                                                        | Required | Default   |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------- | --------- |
| `github-token`   | GitHub token for authentication. Use `${{ secrets.GITHUB_TOKEN }}` or a PAT with workflow perms.   | Yes      | -         |

### Outputs

| Output        | Description                                           |
| ------------- | ----------------------------------------------------- |
| `rerun-count` | Number of failed workflow runs that were re-triggered |

### Example with Custom Trigger Phrase

```yaml
- name: Retest Failed CI
  uses: huntersman/retest-failed-CI@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## How It Works

1. Listens for `issue_comment` events on pull requests
2. Checks if the comment matches the trigger phrase (e.g., `/retest`)
3. Fetches the PR details and gets the head commit SHA
4. Retrieves all workflow runs for that commit
5. Filters for failed, timed-out, or cancelled workflows
6. Re-runs each failed workflow
7. Reports the number of workflows that were re-triggered

## Permissions

The action requires the following permissions:

- `actions: write` - To re-run workflow runs
- `contents: read` - To read repository contents
- `pull-requests: read` - To read pull request information

These are configured in the workflow file as shown in the usage example above.
